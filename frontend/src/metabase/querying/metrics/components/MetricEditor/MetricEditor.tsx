import { forwardRef, useState } from "react";

import { LeaveConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
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
  onCreate: (question: Question) => Promise<Question>;
  onSave: (question: Question) => Promise<void>;
  onCancel: (question: Question) => void;
  onRunQuery: () => Promise<void>;
  onCancelQuery: () => void;
};

export const MetricEditor = forwardRef<HTMLDivElement, MetricEditorProps>(
  function MetricEditor(
    {
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
    },
    ref,
  ) {
    const [modalType, setModalType] = useState<MetricModalType>();
    const isRunnable = Lib.canRun(question.query(), "metric");
    const {
      checkData,
      isConfirmationShown,
      handleInitialSave,
      handleSaveAfterConfirmation,
      handleCloseConfirmation,
    } = PLUGIN_DEPENDENCIES.useCheckCardDependencies({
      onSave,
    });

    const handleCreate = (question: Question) => {
      return onCreate(question.setDefaultDisplay());
    };

    const handleCreateStart = async () => {
      setModalType("create");
    };

    const handleSave = async (question: Question) => {
      await handleInitialSave(question.setDefaultDisplay());
    };

    const handleConfirmCancel = () => {
      onCancel(question);
    };

    const handleCancelStart = () => {
      if (question.isSaved() && isDirty) {
        setModalType("leave");
      } else {
        handleConfirmCancel();
      }
    };

    const handleModalClose = () => {
      setModalType(undefined);
    };

    return (
      <Flex h="100%" direction="column" bg="background-primary" ref={ref}>
        <MetricEditorHeader
          question={question}
          isDirty={isDirty}
          isRunnable={isRunnable}
          isConfirmationShown={isConfirmationShown}
          onCreate={handleCreateStart}
          onSave={handleSave}
          onCancel={handleCancelStart}
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
            onCreate={handleCreate}
            onSave={onSave}
            onClose={handleModalClose}
          />
        )}
        {modalType === "leave" && (
          <LeaveConfirmModal
            opened
            onConfirm={handleConfirmCancel}
            onClose={handleModalClose}
          />
        )}
        {isConfirmationShown && checkData != null && (
          <PLUGIN_DEPENDENCIES.CheckDependenciesModal
            checkData={checkData}
            opened
            onSave={handleSaveAfterConfirmation}
            onClose={handleCloseConfirmation}
          />
        )}
      </Flex>
    );
  },
);
