import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useUpdateCardMutation,
} from "metabase/api";
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
import type { Card } from "metabase-types/api";

import { MetricHeader } from "../../components/MetricHeader";
import { MetricQueryEditor } from "../../components/MetricQueryEditor";
import { getValidationResult } from "../../utils";

type MetricQueryPageParams = {
  cardId: string;
};

type MetricQueryPageProps = {
  params: MetricQueryPageParams;
  route: Route;
};

export function MetricQueryPage({ params, route }: MetricQueryPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <MetricQueryPageBody card={card} route={route} />;
}

type MetricQueryPageBodyProps = {
  card: Card;
  route: Route;
};

function MetricQueryPageBody({ card, route }: MetricQueryPageBodyProps) {
  const [datasetQuery, setDatasetQuery] = useState(card.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const metadata = useSelector(getMetadata);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return Question.create({ dataset_query: datasetQuery, metadata });
  }, [datasetQuery, metadata]);

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

  const handleSave = () => {
    handleInitialSave(question);
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
        data-testid="metric-query-editor"
        gap={0}
      >
        <MetricHeader
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
        <MetricQueryEditor
          query={question.query()}
          uiState={uiState}
          onChangeQuery={handleChangeQuery}
          onChangeUiState={setUiState}
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
