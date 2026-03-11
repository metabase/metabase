import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { getResultMetadata } from "metabase/data-studio/common/utils";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { MetricQueryEditor } from "metabase/metrics/components/MetricQueryEditor";
import { getValidationResult } from "metabase/metrics/utils/validation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Card as MantineCard } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

export type DefinitionState = {
  isDirty: boolean;
  isSaving: boolean;
  isValid: boolean;
  errorMessage?: string;
  onSave: () => void;
  onCancel: () => void;
};

type MetricDefinitionSectionProps = {
  card: Card;
  route?: Route;
  onStateChange?: (state: DefinitionState) => void;
};

export function MetricDefinitionSection({
  card,
  route,
  onStateChange,
}: MetricDefinitionSectionProps) {
  const metadata = useSelector(getMetadata);
  const [datasetQuery, setDatasetQuery] = useState(card.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return new Question(card, metadata).setDatasetQuery(datasetQuery);
  }, [card, metadata, datasetQuery]);

  const resultMetadata = useMemo(() => {
    return getResultMetadata(
      datasetQuery,
      uiState.lastRunQuery,
      uiState.lastRunResult,
    );
  }, [datasetQuery, uiState.lastRunResult, uiState.lastRunQuery]);

  const validationResult = useMemo(
    () => getValidationResult(question.query()),
    [question],
  );

  const isDirty = useMemo(() => {
    return !Lib.areLegacyQueriesEqual(datasetQuery, card.dataset_query);
  }, [datasetQuery, card.dataset_query]);

  const {
    checkData,
    isCheckingDependencies,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckCardDependencies({
    onSave: async (question) => {
      const { display, settings } = Lib.defaultDisplay(question.query());
      const { error } = await updateCard({
        id: card.id,
        dataset_query: question.datasetQuery(),
        display,
        visualization_settings: settings,
        result_metadata: resultMetadata,
      });
      if (error) {
        sendErrorToast(t`Failed to update metric query`);
      } else {
        sendSuccessToast(t`Metric query updated`);
      }
    },
  });

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleSave = useCallback(() => {
    handleInitialSave(question.setResultsMetadata({ columns: resultMetadata }));
  }, [handleInitialSave, question, resultMetadata]);

  const handleCancel = useCallback(() => {
    setDatasetQuery(card.dataset_query);
  }, [card.dataset_query]);

  const handleResetRef = useLatest(() => {
    setDatasetQuery(card.dataset_query);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [card.id, handleResetRef]);

  const isSavingInProgress = isSaving || isCheckingDependencies;

  useLayoutEffect(() => {
    onStateChange?.({
      isDirty,
      isSaving: isSavingInProgress,
      isValid: validationResult.isValid,
      errorMessage: validationResult.errorMessage,
      onSave: handleSave,
      onCancel: handleCancel,
    });
  }, [isDirty, isSavingInProgress, validationResult, onStateChange, handleSave, handleCancel]);

  return (
    <>
      <MantineCard withBorder flex={1} p={0}>
        <MetricQueryEditor
          query={question.query()}
          uiState={uiState}
          readOnly={!card.can_write}
          onChangeQuery={handleChangeQuery}
          onChangeUiState={setUiState}
        />
      </MantineCard>
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      {route && (
        <LeaveRouteConfirmModal
          route={route}
          isEnabled={isDirty && !isSavingInProgress}
        />
      )}
    </>
  );
}
