import { describe, expect, it } from "vitest";
import {
  OFFSETS,
  composeRfc3339,
  formatMinutes,
  formatUtc,
} from "./format.js";

describe("composeRfc3339", () => {
  it("joins wall-clock value and offset", () => {
    expect(composeRfc3339("2026-09-14T10:00:00", "+08:00")).toBe(
      "2026-09-14T10:00:00+08:00"
    );
  });

  it("pads missing seconds (datetime-local without step seconds)", () => {
    expect(composeRfc3339("2026-09-14T10:00", "-05:30")).toBe(
      "2026-09-14T10:00:00-05:30"
    );
  });

  it("maps Z to the +00:00 spelling the API accepts", () => {
    expect(composeRfc3339("2026-09-14T10:00:00", "Z")).toBe(
      "2026-09-14T10:00:00+00:00"
    );
  });

  it("returns empty string for an empty value", () => {
    expect(composeRfc3339("", "+00:00")).toBe("");
  });
});

describe("formatMinutes", () => {
  // Display only: rounded half-up to 2 decimals; the server ignores this.
  it.each([
    [0, "0.00"],
    [1, "0.02"],        // 0.0166... -> 0.02
    [1199, "19.98"],    // one second inside the FAST lower bound -> 19.98
    [1200, "20.00"],    // exact endpoint
    [1800, "30.00"],
    [2401, "40.02"],    // one second over the upper bound
    [2699, "44.98"],
    [5400, "90.00"],
    [86400, "1440.00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatMinutes(seconds)).toBe(expected);
  });
});

describe("offset list", () => {
  it("covers -12:00 through +14:00 in 30 minute steps", () => {
    expect(OFFSETS[0]).toBe("-12:00");
    expect(OFFSETS[OFFSETS.length - 1]).toBe("+14:00");
    expect(OFFSETS).toContain("+00:00");
    expect(OFFSETS).toContain("+05:30");
    expect(OFFSETS.length).toBe(53);
  });
});

describe("formatUtc", () => {
  it("renders the API UTC instants with a trailing Z", () => {
    expect(formatUtc("2026-09-14T02:00:00+00:00")).toBe(
      "2026-09-14T02:00:00Z"
    );
  });
});
