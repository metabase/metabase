import { useState } from "react";

import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, RawSeries } from "metabase-types/api";

import { MetricEditorBody } from "./MetricEditorBody";
import { MetricEditorFooter } from "./MetricEditorFooter";
import { MetricEditorHeader } from "./MetricEditorHeader";
import type { MetricModalType } from "./types";

type MetricEditorProps = {
  question: Question;
  result: Dataset | null;
  rawSeries: RawSeries | null;
  reportTimezone: string;
  isDirty: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  cancelQuery: () => void;
  setQueryBuilderMode: (mode: string) => void;
};

export function MetricEditor({
  question,
  result,
  rawSeries,
  reportTimezone,
  isDirty,
  isRunning,
  isResultDirty,
  onCreate,
  onSave,
  updateQuestion,
  runQuestionQuery,
  cancelQuery,
  setQueryBuilderMode,
}: MetricEditorProps) {
  const [modalType, setModalType] = useState<MetricModalType>();
  const isRunnable = Lib.canRun(question.query(), "metric");

  const handleCreateStart = async () => {
    await updateQuestion(question.setDefaultDisplay());
    setModalType("create");
  };

  const handleCreate = async (question: Question) => {
    await onCreate(question);
    setQueryBuilderMode("view");
  };

  const handleSave = async (question: Question) => {
    await onSave(question);
    setQueryBuilderMode("view");
  };

  const handleCancel = () => {
    if (question.isSaved()) {
      if (isDirty) {
        setModalType("leave");
      } else {
        setQueryBuilderMode("view");
      }
    }
  };

  return (
    <Flex h="100%" direction="column">
      <MetricEditorHeader
        question={question}
        isDirty={isDirty}
        isRunnable={isRunnable}
        onCreate={handleCreateStart}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      <MetricEditorBody
        question={question}
        reportTimezone={reportTimezone}
        isDirty={isDirty}
        isResultDirty={isResultDirty}
        isRunnable={isRunnable}
        updateQuestion={updateQuestion}
        runQuestionQuery={runQuestionQuery}
        setQueryBuilderMode={setQueryBuilderMode}
      />
      <MetricEditorFooter
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        runQuestionQuery={runQuestionQuery}
        cancelQuery={cancelQuery}
      />
      {modalType === "create" && (
        <SaveQuestionModal
          question={question}
          originalQuestion={null}
          opened
          onCreate={handleCreate}
          onSave={handleSave}
          onClose={() => setModalType(undefined)}
        />
      )}
    </Flex>
  );
}
