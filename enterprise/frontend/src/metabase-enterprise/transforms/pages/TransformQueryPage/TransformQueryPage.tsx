import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useSourceState } from "metabase-enterprise/transforms/hooks/use-source-state";
import type { Transform, TransformSource } from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformUrl } from "../../urls";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
};

export function TransformQueryPage({ params }: TransformQueryPageProps) {
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

  return <TransformQueryPageBody transform={transform} />;
}

type TransformQueryPageBodyProps = {
  transform: Transform;
};

export function TransformQueryPageBody({
  transform,
}: TransformQueryPageBodyProps) {
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const { setSource, proposedSource, acceptProposed, clearProposed } =
    useSourceState(transform.id, transform.source);

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
        clearProposed();
        dispatch(push(getTransformUrl(transform.id)));
      }
    },
    onError: () => {
      sendErrorToast(t`Failed to update transform query`);
    },
  });

  const handleSaveSource = async (source: TransformSource) => {
    await handleInitialSave({
      id: transform.id,
      source,
    });
  };

  const handleCancel = () => {
    clearProposed();
    dispatch(push(getTransformUrl(transform.id)));
  };

  if (transform.source.type === "python") {
    return (
      <AdminSettingsLayout fullWidth key={transform.id}>
        <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
          transform={transform}
          initialSource={transform.source}
          proposedSource={
            proposedSource?.type === "python" ? proposedSource : undefined
          }
          isNew={false}
          isSaving={isSaving}
          onSave={handleSaveSource}
          onCancel={handleCancel}
          onRejectProposed={clearProposed}
          onAcceptProposed={acceptProposed}
        />
      </AdminSettingsLayout>
    );
  }

  return (
    <AdminSettingsLayout fullWidth key={transform.id}>
      <QueryEditor
        initialSource={transform.source}
        transform={transform}
        isNew={false}
        isSaving={isSaving || isCheckingDependencies}
        onSave={handleSaveSource}
        onChange={setSource}
        onCancel={handleCancel}
        proposedSource={
          proposedSource?.type === "query" ? proposedSource : undefined
        }
        onRejectProposed={clearProposed}
        onAcceptProposed={acceptProposed}
      />
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
    </AdminSettingsLayout>
  );
}
