import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaneHeaderActions } from "metabase/data-studio/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Center, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, DatasetColumn, Field } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";
import { ModelQueryEditor } from "../../components/ModelQueryEditor";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";
import { getValidationResult } from "../../utils";

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
  const [resultMetadata, setResultMetadata] = useState<
    Field[] | DatasetColumn[] | null
  >(card.result_metadata);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return new Question(card, metadata)
      .setDatasetQuery(datasetQuery)
      .setResultsMetadata({ columns: resultMetadata });
  }, [card, metadata, datasetQuery, resultMetadata]);

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
      const { display, settings } = Lib.defaultDisplay(question.query());
      const { error } = await updateCard({
        id: card.id,
        dataset_query: question.datasetQuery(),
        display,
        visualization_settings: settings,
        result_metadata: resultMetadata,
      });
      if (error) {
        sendErrorToast(t`Failed to update model query`);
      } else {
        sendSuccessToast(t`Model query updated`);
      }
    },
  });

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleSave = () => {
    handleInitialSave(question);
  };

  const handleCancel = () => {
    setDatasetQuery(card.dataset_query);
  };

  const handleResetRef = useLatest(() => {
    setDatasetQuery(card.dataset_query);
    setUiState(getInitialUiState());
    setResultMetadata(card.result_metadata);
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
          onChangeUiState={setUiState}
          onChangeResultMetadata={setResultMetadata}
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
