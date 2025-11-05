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

import { ModelEditor } from "../../components/ModelEditor";

type ModelQueryPageParams = {
  modelId: string;
};

type ModelQueryPageProps = {
  params: ModelQueryPageParams;
  route: Route;
};

export function ModelQueryPage({ params, route }: ModelQueryPageProps) {
  const modelId = Urls.extractEntityId(params.modelId);
  const {
    data: model,
    isLoading,
    error,
  } = useGetCardQuery(modelId != null ? { id: modelId } : skipToken);

  if (isLoading || error != null || model == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ModelQueryPageBody model={model} route={route} />;
}

type ModelQueryPageBodyProps = {
  model: Card;
  route: Route;
};

function ModelQueryPageBody({ model, route }: ModelQueryPageBodyProps) {
  const [datasetQuery, setDatasetQuery] = useState(model.dataset_query);
  const [uiState, setUiState] = useState(getInitialUiState);
  const metadata = useSelector(getMetadata);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const question = useMemo(() => {
    return Question.create({ dataset_query: datasetQuery, metadata });
  }, [datasetQuery, metadata]);

  const isDirty = useMemo(() => {
    return !Lib.areLegacyQueriesEqual(datasetQuery, model.dataset_query);
  }, [datasetQuery, model.dataset_query]);

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
        id: model.id,
        dataset_query: question.datasetQuery(),
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
    setDatasetQuery(model.dataset_query);
  };

  const handleResetRef = useLatest(() => {
    setDatasetQuery(model.dataset_query);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [model.id, handleResetRef]);

  return (
    <>
      <ModelEditor
        id={model.id}
        name={model.name}
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
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
      />
    </>
  );
}
