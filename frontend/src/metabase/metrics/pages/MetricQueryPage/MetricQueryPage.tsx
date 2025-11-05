import { useLayoutEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Center } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { MetricEditor } from "../../components/MetricEditor";

type MetricQueryPageParams = {
  metricId: string;
};

type MetricQueryPageProps = {
  params: MetricQueryPageParams;
};

export function MetricQueryPage({ params }: MetricQueryPageProps) {
  const metricId = Urls.extractEntityId(params.metricId);
  const {
    data: metric,
    isLoading,
    error,
  } = useGetCardQuery(metricId != null ? { id: metricId } : skipToken);

  if (isLoading || error != null || metric == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <MetricQueryPageBody metric={metric} />;
}

type MetricQueryPageBodyProps = {
  metric: Card;
};

function MetricQueryPageBody({ metric }: MetricQueryPageBodyProps) {
  const [datasetQuery, setDatasetQuery] = useState(metric.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const metadata = useSelector(getMetadata);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return Question.create({ dataset_query: datasetQuery, metadata });
  }, [datasetQuery, metadata]);

  const isDirty = useMemo(() => {
    return !Lib.areLegacyQueriesEqual(datasetQuery, metric.dataset_query);
  }, [datasetQuery, metric.dataset_query]);

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
        id: metric.id,
        dataset_query: question.datasetQuery(),
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
    setDatasetQuery(metric.dataset_query);
  };

  const handleResetRef = useLatest(() => {
    setDatasetQuery(metric.dataset_query);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [metric.id, handleResetRef]);

  return (
    <>
      <MetricEditor
        id={metric.id}
        name={metric.name}
        query={question.query()}
        uiState={uiState}
        isDirty={isDirty}
        isSaving={isSaving || isCheckingDependencies}
        onChangeQuery={handleChangeQuery}
        onChangeUiState={setUiState}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
    </>
  );
}
