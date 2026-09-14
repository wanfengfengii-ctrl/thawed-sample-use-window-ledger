// Thin JSON client. The browser talks to same-origin paths; nginx proxies
// /api to the API container in production.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: text };
    }
  }
  if (!res.ok) {
    const detail =
      body && body.detail
        ? typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail)
        : `请求失败（HTTP ${res.status}）`;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return body;
}

export function createEvaluation(payload) {
  return request("/api/evaluations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listEvaluations(batchCode) {
  const query = batchCode ? `?batch_code=${encodeURIComponent(batchCode)}` : "";
  return request(`/api/evaluations${query}`);
}

export function getEvaluation(id) {
  return request(`/api/evaluations/${encodeURIComponent(id)}`);
}
