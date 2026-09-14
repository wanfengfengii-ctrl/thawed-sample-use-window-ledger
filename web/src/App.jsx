import { useCallback, useEffect, useState } from "react";
import EvaluationForm from "./components/EvaluationForm.jsx";
import RecordDetail from "./components/RecordDetail.jsx";
import HistoryList from "./components/HistoryList.jsx";
import { createEvaluation, getEvaluation, listEvaluations } from "./api.js";

export default function App() {
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refreshList = useCallback(async () => {
    const all = await listEvaluations();
    setRecords(all);
  }, []);

  const openRecord = useCallback(async (id) => {
    setDetailLoading(true);
    setError("");
    try {
      const fresh = await getEvaluation(id);
      setSelected(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList().catch((err) => setError(err.message));
  }, [refreshList]);

  async function handleSubmit(payload) {
    setSubmitting(true);
    setError("");
    try {
      const record = await createEvaluation(payload);
      await refreshList();
      await openRecord(record.id);
      return record;
    } catch (err) {
      // Illegal input: nothing was saved; the banner is the only trace.
      setError(err.message);
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <header>
        <h1>冻存样本复苏窗口判定簿</h1>
        <p className="hint">
          裁决一律由 API 换算 UTC 后按整秒作出，分钟数仅四舍五入展示；
          每次提交都是独立、不可覆盖的记录。
        </p>
      </header>

      {error && (
        <div className="error-banner" data-testid="error-banner" role="alert">
          {error}
          <button
            type="button"
            className="dismiss"
            data-testid="dismiss-error"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}

      <div className="layout">
        <EvaluationForm onSubmitted={handleSubmit} disabled={submitting} />
        <RecordDetail
          record={selected}
          loading={detailLoading}
          onRefresh={openRecord}
        />
      </div>

      <HistoryList records={records} selectedId={selected?.id} onSelect={openRecord} />
    </main>
  );
}
