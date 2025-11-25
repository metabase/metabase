import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  type QueryEditorUiState,
  getInitialUiState,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Center, Stack } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";
import { getResultMetadata } from "metabase-enterprise/data-studio/common/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { PaneHeaderActions } from "../../../common/components/PaneHeader";
import { ModelHeader } from "../../components/ModelHeader";
import { ModelQueryEditor } from "../../components/ModelQueryEditor";
import { getValidationResult } from "../../utils";

import {
  applyFieldOverridesInDataset,
  applyFieldOverridesInResultMetadata,
} from "./utils";

type ModelQueryPageParams = {
  cardId: string;
};

type ModelQueryPageProps = {
  params: ModelQueryPageParams;
  route: Route;
};

export function ModelQueryPage({ params, route }: ModelQueryPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ModelQueryPageBody card={card} route={route} />;
}

type ModelQueryPageBodyProps = {
  card: Card;
  route: Route;
};

function ModelQueryPageBody({ card, route }: ModelQueryPageBodyProps) {
  const metadata = useSelector(getMetadata);
  const [datasetQuery, setDatasetQuery] = useState(card.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return new Question(card, metadata).setDatasetQuery(datasetQuery);
  }, [card, metadata, datasetQuery]);

  const resultMetadata = useMemo(() => {
    const fields = getResultMetadata(
      datasetQuery,
      uiState.lastRunQuery,
      uiState.lastRunResult,
    );
    if (fields == null || card.result_metadata == null) {
      return fields;
    }
    return applyFieldOverridesInResultMetadata(fields, card.result_metadata);
  }, [card, datasetQuery, uiState.lastRunResult, uiState.lastRunQuery]);

  const validationResult = useMemo(
    () => getValidationResult(question.query(), resultMetadata),
    [question, resultMetadata],
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
      const { error } = await updateCard({
        id: card.id,
        dataset_query: question.datasetQuery(),
        result_metadata: resultMetadata,
      });
      if (error) {
        sendErrorToast(t`Failed to update model query`);
      } else {
        sendSuccessToast(t`Model query updated`);
      }
    },
  });

  const handleChangeQuery = (newQuery: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(newQuery));
  };

  const handleChangeUiState = (newUiState: QueryEditorUiState) => {
    if (
      card.result_metadata != null &&
      newUiState.lastRunResult != null &&
      newUiState.lastRunResult !== uiState.lastRunResult
    ) {
      setUiState({
        ...newUiState,
        lastRunResult: applyFieldOverridesInDataset(
          newUiState.lastRunResult,
          card.result_metadata,
        ),
      });
    } else {
      setUiState(newUiState);
    }
  };

  const handleSave = () => {
    handleInitialSave(question.setResultsMetadata({ columns: resultMetadata }));
  };

  const handleCancel = () => {
    setDatasetQuery(card.dataset_query);
  };

  const handleResetRef = useLatest(() => {
    setDatasetQuery(card.dataset_query);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [card.id, handleResetRef]);

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        data-testid="model-query-editor"
        gap={0}
      >
        <ModelHeader
          card={card}
          actions={
            <PaneHeaderActions
              errorMessage={validationResult.errorMessage}
              isValid={validationResult.isValid}
              isDirty={isDirty}
              isSaving={isSaving || isCheckingDependencies}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <ModelQueryEditor
          query={question.query()}
          uiState={uiState}
          readOnly={!card.can_write}
          onChangeQuery={handleChangeQuery}
          onChangeUiState={handleChangeUiState}
        />
      </Stack>
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
      />
    </>
  );
}
