import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

// Minimal in-memory backend standing in for the real API. The real
// browser<->API<->PostgreSQL path is covered by Playwright.
const fetchMock = vi.fn();

const eligibleRecord = {
  id: 7,
  batch_code: "VITEST-1",
  category: "FAST",
  thaw_completed_at: "2026-09-14T18:00:00+08:00",
  planned_use_at: "2026-09-14T18:30:00+08:00",
  thaw_completed_at_utc: "2026-09-14T10:00:00+00:00",
  planned_use_at_utc: "2026-09-14T10:30:00+00:00",
  elapsed_seconds: 1800,
  window_lower_seconds: 1200,
  window_upper_seconds: 2400,
  result: "ELIGIBLE",
  reason: "WITHIN_WINDOW",
  created_at: "2026-09-14T10:30:00+00:00",
};

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

async function fakeBackend(url, options = {}) {
  const method = options.method || "GET";
  const path = String(url);
  if (method === "GET" && path === "/api/evaluations") {
    return jsonResponse(200, store.rows);
  }
  if (method === "POST" && path === "/api/evaluations") {
    if (store.rejectNext) {
      return jsonResponse(422, {
        detail:
          "planned_use_at must not be later than 24 hours after thaw_completed_at",
      });
    }
    const body = JSON.parse(options.body);
    const record = {
      ...eligibleRecord,
      id: store.nextId,
      ...body,
      thaw_completed_at_utc: "2026-09-14T10:00:00+00:00",
      planned_use_at_utc: "2026-09-14T10:30:00+00:00",
      elapsed_seconds: 1800,
      window_lower_seconds: body.category === "STANDARD" ? 2700 : 1200,
      window_upper_seconds: body.category === "STANDARD" ? 5400 : 2400,
      result: "ELIGIBLE",
      reason: "WITHIN_WINDOW",
    };
    store.nextId += 1;
    store.rows = [record, ...store.rows];
    return jsonResponse(201, record);
  }
  const match = path.match(/^\/api\/evaluations\/(\d+)$/);
  if (method === "GET" && match) {
    const row = store.rows.find((r) => String(r.id) === match[1]);
    return row
      ? jsonResponse(200, row)
      : jsonResponse(404, { detail: "evaluation not found" });
  }
  return jsonResponse(404, { detail: "unmatched " + path });
}

const store = { rows: [], nextId: 7, rejectNext: false };

beforeEach(() => {
  store.rows = [];
  store.nextId = 7;
  store.rejectNext = false;
  fetchMock.mockImplementation(fakeBackend);
  global.fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockClear();
});

function fillForm(overrides = {}) {
  fireEvent.change(screen.getByTestId("input-batch-code"), {
    target: { value: overrides.batch ?? "VITEST-1" },
  });
  if (overrides.category === "STANDARD") {
    fireEvent.click(screen.getByTestId("category-standard"));
  }
  fireEvent.change(screen.getByTestId("input-thaw-time"), {
    target: { value: overrides.thaw ?? "2026-09-14T18:00:00" },
  });
  fireEvent.change(screen.getByTestId("input-planned-time"), {
    target: { value: overrides.planned ?? "2026-09-14T18:30:00" },
  });
  fireEvent.change(screen.getByTestId("input-thaw-offset"), {
    target: { value: overrides.thawOffset ?? "+08:00" },
  });
  fireEvent.change(screen.getByTestId("input-planned-offset"), {
    target: { value: overrides.plannedOffset ?? "+08:00" },
  });
  fireEvent.click(screen.getByTestId("submit-button"));
}

it("submits RFC3339 strings and renders verdict, UTC delta and rounded minutes", async () => {
  render(<App />);
  await screen.findByText("暂无评估记录。");

  fillForm();

  expect(await screen.findByTestId("detail-result")).toHaveTextContent(
    "ELIGIBLE"
  );
  // The exact RFC3339 payload carried an offset, not rounded minutes.
  const postCall = fetchMock.mock.calls.find(
    ([u, o]) => String(u) === "/api/evaluations" && o.method === "POST"
  );
  const payload = JSON.parse(postCall[1].body);
  expect(payload).toEqual({
    batch_code: "VITEST-1",
    category: "FAST",
    thaw_completed_at: "2026-09-14T18:00:00+08:00",
    planned_use_at: "2026-09-14T18:30:00+08:00",
  });

  expect(screen.getByTestId("detail-thaw-raw")).toHaveTextContent(
    "2026-09-14T18:00:00+08:00"
  );
  expect(screen.getByTestId("detail-thaw-utc")).toHaveTextContent(
    "2026-09-14T10:00:00Z"
  );
  expect(screen.getByTestId("detail-elapsed-seconds")).toHaveTextContent("1800");
  expect(screen.getByTestId("detail-minutes")).toHaveTextContent("30.00");
  expect(screen.getByTestId("history-utc-delta-7")).toHaveTextContent(
    "1800 秒（30.00 分钟）"
  );
});

it("shows only an explicit error for illegal time and saves nothing", async () => {
  store.rejectNext = true;
  render(<App />);
  await screen.findByText("暂无评估记录。");

  fillForm();

  const banner = await screen.findByTestId("error-banner");
  expect(banner).toHaveTextContent("24 hours");
  // No record appears in the history; the form input remains for correction.
  expect(screen.getByText("暂无评估记录。")).toBeInTheDocument();
  expect(screen.queryByTestId("detail-result")).not.toBeInTheDocument();
});

it("reopens a record from history and refreshes via fresh GET", async () => {
  store.rows = [{ ...eligibleRecord }];
  render(<App />);
  await screen.findByTestId("history-row-7");

  fireEvent.click(screen.getByTestId("history-row-7"));
  expect(await screen.findByTestId("detail-result")).toHaveTextContent(
    "ELIGIBLE"
  );

  fireEvent.click(screen.getByTestId("refresh-detail"));
  await waitFor(() =>
    expect(screen.getByTestId("detail-planned-raw")).toHaveTextContent(
      "2026-09-14T18:30:00+08:00"
    )
  );
});
