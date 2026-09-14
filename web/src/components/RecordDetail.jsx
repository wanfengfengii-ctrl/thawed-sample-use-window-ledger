import {
  CATEGORY_LABELS,
  REASON_TEXT,
  RESULT_TEXT,
  formatMinutes,
  formatUtc,
} from "../format.js";

function Row({ label, children, testid }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd data-testid={testid}>{children}</dd>
    </div>
  );
}

export default function RecordDetail({ record, loading, onRefresh }) {
  if (loading) {
    return (
      <section className="card" data-testid="detail">
        <h2>评估详情</h2>
        <p>加载中…</p>
      </section>
    );
  }
  if (!record) {
    return (
      <section className="card" data-testid="detail">
        <h2>评估详情</h2>
        <p className="hint">提交后在此查看裁决；换班后可从历史记录重新打开复查。</p>
      </section>
    );
  }

  const eligible = record.result === "ELIGIBLE";

  return (
    <section className="card" data-testid="detail">
      <div className="detail-head">
        <h2>
          评估详情 <span className="muted">#{record.id}</span>
        </h2>
        <button
          type="button"
          className="secondary"
          data-testid="refresh-detail"
          onClick={() => onRefresh(record.id)}
        >
          刷新复查
        </button>
      </div>

      <div
        className={`verdict ${eligible ? "ok" : "bad"}`}
        data-testid="detail-result"
      >
        {RESULT_TEXT[record.result] || record.result}
      </div>
      <p className="reason" data-testid="detail-reason">
        {REASON_TEXT[record.reason] || record.reason}
      </p>

      <dl>
        <Row label="批次代码" testid="detail-batch">
          {record.batch_code}
        </Row>
        <Row label="样本类别" testid="detail-category">
          {CATEGORY_LABELS[record.category] || record.category}
        </Row>
        <Row label="复苏完成时间（原始提交）" testid="detail-thaw-raw">
          {record.thaw_completed_at}
        </Row>
        <Row label="计划使用时间（原始提交）" testid="detail-planned-raw">
          {record.planned_use_at}
        </Row>
        <Row label="复苏完成时间（UTC）" testid="detail-thaw-utc">
          {formatUtc(record.thaw_completed_at_utc)}
        </Row>
        <Row label="计划使用时间（UTC）" testid="detail-planned-utc">
          {formatUtc(record.planned_use_at_utc)}
        </Row>
        <Row label="UTC 时间差（裁决依据，秒）" testid="detail-elapsed-seconds">
          {record.elapsed_seconds}
        </Row>
        <Row label="折合分钟（展示用，四舍五入两位）" testid="detail-minutes">
          {formatMinutes(record.elapsed_seconds)}
        </Row>
        <Row label="适用窗口下限（秒）" testid="detail-lower">
          {record.window_lower_seconds}（{formatMinutes(record.window_lower_seconds)} 分钟）
        </Row>
        <Row label="适用窗口上限（秒）" testid="detail-upper">
          {record.window_upper_seconds}（{formatMinutes(record.window_upper_seconds)} 分钟）
        </Row>
      </dl>
    </section>
  );
}
