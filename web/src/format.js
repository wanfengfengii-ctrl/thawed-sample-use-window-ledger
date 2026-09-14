// Display-only helpers. Rounded minutes are NEVER sent to the server and never
// participate in adjudication; the server decides in whole UTC seconds.

function pad2(value) {
  return String(value).padStart(2, "0");
}

// UTC offsets from -12:00 to +14:00 in 15-minute steps. Real zones live on
// quarter hours (e.g. +05:45 Nepal, +08:45 Eucla, +12:45 Chatham).
export const OFFSETS = (() => {
  const values = [];
  for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 15) {
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    values.push(`${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`);
  }
  return values;
})();

export function defaultOffset() {
  // getTimezoneOffset is minutes behind UTC, so invert the sign.
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// Compose an <input type="datetime-local" step="1"> value and an offset into
// an RFC 3339 string, e.g. ("2026-09-14T10:00:00", "+08:00") ->
// "2026-09-14T10:00:00+08:00".
export function composeRfc3339(localValue, offset) {
  if (!localValue) return "";
  const withSeconds = /\d{2}:\d{2}:\d{2}$/.test(localValue)
    ? localValue
    : `${localValue}:00`;
  return `${withSeconds}${offset === "Z" ? "+00:00" : offset}`;
}

// Round half away from zero to 2 decimal places and render a fixed-2 string.
// Elapsed seconds are non-negative, but the helper is general.
export function formatMinutes(seconds) {
  const sign = seconds < 0 ? -1 : 1;
  const rounded = sign * Math.round(Math.abs(seconds / 60) * 100) / 100;
  return rounded.toFixed(2);
}

export function formatUtc(value) {
  if (!value) return "";
  return value.replace("+00:00", "Z");
}

export const CATEGORY_LABELS = {
  FAST: "FAST（20–40 分钟）",
  STANDARD: "STANDARD（45–90 分钟）",
};

export const REASON_TEXT = {
  WITHIN_WINDOW: "处于适用窗口内（含端点）",
  BELOW_LOWER_BOUND: "复苏后等待时间低于窗口下限",
  ABOVE_UPPER_BOUND: "复苏后等待时间高于窗口上限",
};

export const RESULT_TEXT = {
  ELIGIBLE: "ELIGIBLE（合格）",
  OUT_OF_WINDOW: "OUT_OF_WINDOW（窗口外）",
};
