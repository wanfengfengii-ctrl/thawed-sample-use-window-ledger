import { useState } from "react";
import { OFFSETS, defaultOffset, composeRfc3339 } from "../format.js";

export default function EvaluationForm({ onSubmitted, onError, disabled }) {
  const [batchCode, setBatchCode] = useState("");
  const [category, setCategory] = useState("FAST");
  const [thawLocal, setThawLocal] = useState("");
  const [plannedLocal, setPlannedLocal] = useState("");
  const [thawOffset, setThawOffset] = useState(defaultOffset());
  const [plannedOffset, setPlannedOffset] = useState(defaultOffset());

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      batch_code: batchCode.trim(),
      category,
      thaw_completed_at: composeRfc3339(thawLocal, thawOffset),
      planned_use_at: composeRfc3339(plannedLocal, plannedOffset),
    };
    try {
      const record = await onSubmitted(payload);
      if (record) {
        setBatchCode("");
        setThawLocal("");
        setPlannedLocal("");
      }
    } catch {
      // App renders the banner; nothing to do here.
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} data-testid="evaluation-form">
      <h2>提交复苏评估</h2>

      <label className="field">
        <span>批次代码</span>
        <input
          data-testid="input-batch-code"
          value={batchCode}
          onChange={(e) => setBatchCode(e.target.value.toUpperCase())}
          placeholder="1–20 位大写字母 / 数字 / 连字符，如 A-01"
          maxLength={20}
          required
        />
      </label>

      <fieldset className="field">
        <legend>样本类别</legend>
        <label className="inline">
          <input
            type="radio"
            name="category"
            value="FAST"
            data-testid="category-fast"
            checked={category === "FAST"}
            onChange={(e) => setCategory(e.target.value)}
          />
          FAST（20–40 分钟）
        </label>
        <label className="inline">
          <input
            type="radio"
            name="category"
            value="STANDARD"
            data-testid="category-standard"
            checked={category === "STANDARD"}
            onChange={(e) => setCategory(e.target.value)}
          />
          STANDARD（45–90 分钟）
        </label>
      </fieldset>

      <div className="grid-2">
        <label className="field">
          <span>复苏完成时间（墙钟）</span>
          <input
            type="datetime-local"
            step="1"
            data-testid="input-thaw-time"
            value={thawLocal}
            onChange={(e) => setThawLocal(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>时区</span>
          <select
            data-testid="input-thaw-offset"
            value={thawOffset}
            onChange={(e) => setThawOffset(e.target.value)}
          >
            {OFFSETS.map((o) => (
              <option key={o} value={o}>
                UTC{o}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>计划使用时间（墙钟）</span>
          <input
            type="datetime-local"
            step="1"
            data-testid="input-planned-time"
            value={plannedLocal}
            onChange={(e) => setPlannedLocal(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>时区</span>
          <select
            data-testid="input-planned-offset"
            value={plannedOffset}
            onChange={(e) => setPlannedOffset(e.target.value)}
          >
            {OFFSETS.map((o) => (
              <option key={o} value={o}>
                UTC{o}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="hint">
        时间以带 UTC 偏移的 RFC3339 字符串提交，服务端换算 UTC 后按整秒裁决；
        页面分钟数四舍五入保留两位，仅供展示。
      </p>

      <button type="submit" data-testid="submit-button" disabled={disabled}>
        {disabled ? "裁决中…" : "提交裁决"}
      </button>
    </form>
  );
}
