import { useLayoutEffect, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { isNotDraftSource } from "../../utils";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
  route: Route;
};

export function TransformQueryPage({ params, route }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Transform not found.`} />;
  }

  return <TransformQueryPageBody transform={transform} route={route} />;
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  route: Route;
};

export function TransformQueryPageBody({
  transform,
  route,
}: TransformQueryPageBodyProps) {
  const {
    source,
    proposedSource,
    isDirty,
    setSource,
    acceptProposed,
    rejectProposed,
  } = useSourceState(transform.id, transform.source);
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  useRegisterMetabotTransformContext(transform, source);

  const resetRef = useLatest(() => {
    setSource(transform.source);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    resetRef.current();
  }, [transform.id, resetRef]);

  const {
    checkData,
    isCheckingDependencies,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckTransformDependencies({
    onSave: async (request) => {
      const { error } = await updateTransform(request);
      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);
        dispatch(push(Urls.transform(transform.id)));
      }
    },
  });

  const handleSave = async () => {
    if (isNotDraftSource(source)) {
      await handleInitialSave({
        id: transform.id,
        source,
      });
    }
  };

  const handleCancel = () => {
    dispatch(push(Urls.transform(transform.id)));
  };

  return (
    <AdminSettingsLayout fullWidth>
      {source.type === "python" ? null : (
        <TransformEditor
          name={transform.name}
          source={source}
          proposedSource={
            proposedSource?.type === "query" ? proposedSource : undefined
          }
          uiState={uiState}
          isNew={false}
          isDirty={isDirty}
          isSaving={isSaving || isCheckingDependencies}
          onChangeSource={setSource}
          onChangeUiState={setUiState}
          onSave={handleSave}
          onCancel={handleCancel}
          onAcceptProposed={acceptProposed}
          onRejectProposed={rejectProposed}
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
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
        onConfirm={rejectProposed}
      />
    </AdminSettingsLayout>
  );
}
