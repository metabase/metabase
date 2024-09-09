import { useState } from "react";

import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
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
  isResultDirty: boolean;
  isRunning: boolean;
  onChange: (question: Question) => Promise<void>;
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;
  onCancel: (question: Question) => void;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export function MetricEditor({
  question,
  result,
  rawSeries,
  reportTimezone,
  isDirty,
  isRunning,
  isResultDirty,
  onChange,
  onCreate,
  onSave,
  onCancel,
  onRunQuery,
  onCancelQuery,
}: MetricEditorProps) {
  const [modalType, setModalType] = useState<MetricModalType>();
  const isRunnable = Lib.canRun(question.query(), "metric");

  const handleCreate = async () => {
    await onChange(question.setDefaultDisplay());
    setModalType("create");
  };

  const handleCancel = () => {
    if (question.isSaved() && isDirty) {
      setModalType("leave");
    } else {
      onCancel(question);
    }
  };

  const handleModalClose = () => {
    setModalType(undefined);
  };

  return (
    <Flex h="100%" direction="column" bg="white">
      <MetricEditorHeader
        question={question}
        isDirty={isDirty}
        isRunnable={isRunnable}
        onCreate={handleCreate}
        onSave={onSave}
        onCancel={handleCancel}
      />
      <MetricEditorBody
        question={question}
        reportTimezone={reportTimezone}
        isDirty={isDirty}
        isResultDirty={isResultDirty}
        isRunnable={isRunnable}
        onChange={onChange}
        onRunQuery={onRunQuery}
      />
      <MetricEditorFooter
        question={question}
        result={result}
        rawSeries={rawSeries}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        onRunQuery={onRunQuery}
        onCancelQuery={onCancelQuery}
      />
      {modalType === "create" && (
        <SaveQuestionModal
          question={question}
          originalQuestion={null}
          opened
          onCreate={onCreate}
          onSave={onSave}
          onClose={handleModalClose}
        />
      )}
      {modalType === "leave" && (
        <Modal isOpen>
          <LeaveConfirmationModalContent
            onAction={handleCancel}
            onClose={handleModalClose}
          />
        </Modal>
      )}
    </Flex>
  );
}
