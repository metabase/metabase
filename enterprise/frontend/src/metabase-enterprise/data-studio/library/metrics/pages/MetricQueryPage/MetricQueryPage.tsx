import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import { getResultMetadata } from "metabase/data-studio/common/utils";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Center } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card as CardType } from "metabase-types/api";

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
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

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
  card: CardType;
  route: Route;
};

function MetricQueryPageBody({ card, route }: MetricQueryPageBodyProps) {
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
      <PageContainer pos="relative" data-testid="metric-query-editor" gap="xl">
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
        <Card withBorder flex={1} p={0}>
          <MetricQueryEditor
            query={question.query()}
            uiState={uiState}
            readOnly={!card.can_write}
            onChangeQuery={handleChangeQuery}
            onChangeUiState={setUiState}
          />
        </Card>
      </PageContainer>
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
