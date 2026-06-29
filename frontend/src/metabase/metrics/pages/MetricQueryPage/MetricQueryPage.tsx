import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeaderActions } from "metabase/common/data-studio/components/PaneHeader";
import { getResultMetadata } from "metabase/common/data-studio/utils/get-result-metadata";
import type {
  MetricPageProps,
  MetricUrls,
} from "metabase/common/metrics/types";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card as CardApiType } from "metabase-types/api";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { MetricQueryEditor } from "../../components/MetricQueryEditor";
import { metricUrls as defaultUrls } from "../../urls";
import { getValidationResult } from "../../utils/validation";

interface MetricQueryPageProps extends MetricPageProps {
  route: Route;
}

export function MetricQueryPage({
  params,
  route,
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricQueryPageProps) {
  return (
    <MetricPageCard cardId={params.cardId}>
      {(card) => (
        <MetricQueryPageBody
          card={card}
          route={route}
          urls={urls}
          renderBreadcrumbs={renderBreadcrumbs}
          showAppSwitcher={showAppSwitcher}
          showDataStudioLink={showDataStudioLink}
        />
      )}
    </MetricPageCard>
  );
}

interface MetricQueryPageBodyProps extends Omit<
  MetricQueryPageProps,
  "params"
> {
  card: CardApiType;
  urls: MetricUrls;
}

function MetricQueryPageBody({
  card,
  route,
  urls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink,
}: MetricQueryPageBodyProps) {
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

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleSave = async () => {
    const questionWithMetadata = question.setResultsMetadata(
      resultMetadata ? { columns: resultMetadata } : null,
    );
    const { display, settings } = Lib.defaultDisplay(
      questionWithMetadata.query(),
    );
    const { error } = await updateCard({
      id: card.id,
      dataset_query: questionWithMetadata.datasetQuery(),
      display,
      visualization_settings: settings,
      result_metadata: resultMetadata,
    });
    if (error) {
      sendErrorToast(t`Failed to update metric query`);
    } else {
      sendSuccessToast(t`Metric query updated`);
    }
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
        <MetricPageShell
          card={card}
          urls={urls}
          renderBreadcrumbs={renderBreadcrumbs}
          showAppSwitcher={showAppSwitcher}
          showDataStudioLink={showDataStudioLink}
          actions={
            <PaneHeaderActions
              errorMessage={validationResult.errorMessage}
              isValid={validationResult.isValid}
              isDirty={isDirty}
              isSaving={isSaving}
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
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}
