// End-to-end tests against the real stack: browser -> nginx -> FastAPI ->
// PostgreSQL. No part of the chain is mocked.
import { expect, test } from "@playwright/test";

// Short unique suffix so repeat runs (or a long-lived database volume) cannot
// confuse old rows with the ones created by this run.
const RUN = Date.now().toString(36).toUpperCase();

async function submit(page, { batch, category, thaw, planned, thawOffset = "+00:00", plannedOffset = "+00:00" }) {
  await page.getByTestId("input-batch-code").fill(batch);
  if (category === "STANDARD") {
    await page.getByTestId("category-standard").check();
  } else {
    await page.getByTestId("category-fast").check();
  }
  await page.getByTestId("input-thaw-time").fill(thaw);
  await page.getByTestId("input-planned-time").fill(planned);
  await page.getByTestId("input-thaw-offset").selectOption(thawOffset);
  await page.getByTestId("input-planned-offset").selectOption(plannedOffset);
  await page.getByTestId("submit-button").click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("FAST sample at exactly 30 minutes is ELIGIBLE with UTC seconds and rounded minutes", async ({ page }) => {
  await submit(page, {
    batch: "E2E-OK-1",
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T10:30",
  });

  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-reason")).toHaveText(/窗口内/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("1800");
  await expect(page.getByTestId("detail-minutes")).toHaveText("30.00");
  await expect(page.getByTestId("detail-lower")).toHaveText(/1200/);
  await expect(page.getByTestId("detail-upper")).toHaveText(/2400/);
  await expect(page.getByTestId("detail-thaw-raw")).toHaveText(
    "2026-09-14T10:00:00+00:00"
  );
  await expect(page.getByTestId("detail-thaw-utc")).toHaveText(
    "2026-09-14T10:00:00Z"
  );
});

test("closed endpoints: 20:00 eligible, 40:01 out above upper bound", async ({ page }) => {
  await submit(page, {
    batch: "E2E-EDGE-LO",
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T10:20",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("1200");

  await submit(page, {
    batch: "E2E-EDGE-HI",
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T10:40:01",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/OUT_OF_WINDOW/);
  await expect(page.getByTestId("detail-reason")).toHaveText(/高于窗口上限/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("2401");
  // Displayed minutes round to 40.02, never retroactively flipping the verdict.
  await expect(page.getByTestId("detail-minutes")).toHaveText("40.02");
});

test("STANDARD window uses 45-90 minutes", async ({ page }) => {
  await submit(page, {
    batch: "E2E-STD",
    category: "STANDARD",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T11:30",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-lower")).toHaveText(/2700/);
  await expect(page.getByTestId("detail-upper")).toHaveText(/5400/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("5400");
});

test("wall-clock trap: mixed offsets resolving to the same instant is 0 seconds", async ({ page }) => {
  // 10:00 at +08:00 and 03:00 at +01:00 are the same UTC instant.
  await submit(page, {
    batch: "E2E-TZ",
    category: "STANDARD",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T03:00",
    thawOffset: "+08:00",
    plannedOffset: "+01:00",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/OUT_OF_WINDOW/);
  await expect(page.getByTestId("detail-reason")).toHaveText(/低于窗口下限/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("0");
  await expect(page.getByTestId("detail-thaw-utc")).toHaveText(
    "2026-09-14T02:00:00Z"
  );
  await expect(page.getByTestId("detail-planned-utc")).toHaveText(
    "2026-09-14T02:00:00Z"
  );
});

test("quarter-hour zone +05:45 (Nepal) is selectable and adjudicated in UTC", async ({ page }) => {
  // 13:00 at +05:45 is 07:15Z; 13:45 at +05:45 is 08:00Z: 2700s, exactly the
  // STANDARD lower endpoint. selectOption would fail if the option were absent.
  await submit(page, {
    batch: `E2E-NPT-${RUN}`,
    category: "STANDARD",
    thaw: "2026-09-14T13:00",
    planned: "2026-09-14T13:45",
    thawOffset: "+05:45",
    plannedOffset: "+05:45",
  });

  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("2700");
  await expect(page.getByTestId("detail-minutes")).toHaveText("45.00");
  await expect(page.getByTestId("detail-thaw-raw")).toHaveText(
    "2026-09-14T13:00:00+05:45"
  );
  await expect(page.getByTestId("detail-thaw-utc")).toHaveText(
    "2026-09-14T07:15:00Z"
  );
  await expect(page.getByTestId("detail-planned-utc")).toHaveText(
    "2026-09-14T08:00:00Z"
  );
});

test("illegal planned time (>24h) shows a clear error and leaves no record", async ({ page, request }) => {
  const batch = `E2E-BAD24H-${RUN}`;
  const before = await request.get(`/api/evaluations?batch_code=${batch}`);
  const beforeIds = (await before.json()).map((r) => r.id);

  await submit(page, {
    batch,
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-15T10:00:01",
  });

  await expect(page.getByTestId("error-banner")).toHaveText(/24 hours/);
  await expect(page.getByTestId("detail")).not.toContainText(/ELIGIBLE|OUT_OF_WINDOW/);

  const after = await request.get(`/api/evaluations?batch_code=${batch}`);
  const afterIds = (await after.json()).map((r) => r.id);
  expect(afterIds).toEqual(beforeIds);
});

test("repeated batch keeps the original record; refresh after reload shows the old conclusion", async ({ page }) => {
  await submit(page, {
    batch: `E2E-DUP-${RUN}`,
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T10:30",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);

  await submit(page, {
    batch: `E2E-DUP-${RUN}`,
    category: "FAST",
    thaw: "2026-09-14T10:00",
    planned: "2026-09-14T10:41",
  });
  await expect(page.getByTestId("detail-result")).toHaveText(/OUT_OF_WINDOW/);

  // Two independent rows exist for the same batch; reopen the older one.
  const dupRows = page.locator("tr", { hasText: `E2E-DUP-${RUN}` });
  await expect(dupRows).toHaveCount(2);
  // Newest first: the older (ELIGIBLE) record is the second row.
  await dupRows.nth(1).click();
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-planned-raw")).toHaveText(
    "2026-09-14T10:30:00+00:00"
  );
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("1800");

  // Shift-change review: reload, reopen the same record from history.
  await page.reload();
  const reopenedRows = page.locator("tr", { hasText: `E2E-DUP-${RUN}` });
  await expect(reopenedRows).toHaveCount(2);
  await reopenedRows.nth(1).click();
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-thaw-raw")).toHaveText(
    "2026-09-14T10:00:00+00:00"
  );
  await expect(page.getByTestId("detail-planned-utc")).toHaveText(
    "2026-09-14T10:30:00Z"
  );

  await page.getByTestId("refresh-detail").click();
  await expect(page.getByTestId("detail-result")).toHaveText(/ELIGIBLE/);
  await expect(page.getByTestId("detail-elapsed-seconds")).toHaveText("1800");
});
