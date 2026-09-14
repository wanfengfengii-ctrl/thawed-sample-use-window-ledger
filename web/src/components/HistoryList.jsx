import { CATEGORY_LABELS, RESULT_TEXT, formatMinutes } from "../format.js";

export default function HistoryList({ records, selectedId, onSelect }) {
  return (
    <section className="card" data-testid="history">
      <h2>历史记录</h2>
      {records.length === 0 ? (
        <p className="hint">暂无评估记录。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>批次代码</th>
              <th>类别</th>
              <th>原始时间（复苏 / 计划）</th>
              <th>UTC 差值</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr
                key={r.id}
                className={r.id === selectedId ? "selected" : ""}
                data-testid={`history-row-${r.id}`}
                onClick={() => onSelect(r.id)}
              >
                <td>{r.id}</td>
                <td>{r.batch_code}</td>
                <td>{CATEGORY_LABELS[r.category] || r.category}</td>
                <td className="mono">
                  {r.thaw_completed_at}
                  <br />
                  {r.planned_use_at}
                </td>
                <td data-testid={`history-utc-delta-${r.id}`}>
                  {r.elapsed_seconds} 秒（{formatMinutes(r.elapsed_seconds)} 分钟）
                </td>
                <td data-testid={`history-result-${r.id}`}>
                  <span className={r.result === "ELIGIBLE" ? "tag ok" : "tag bad"}>
                    {RESULT_TEXT[r.result] || r.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
