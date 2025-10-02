import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import {
  deactivateSuggestedTransform,
  getMetabotSuggestedTransform,
} from "metabase-enterprise/metabot/state";
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

  const initialSource = transform.source;
  const [source, setSource] = useState(initialSource);

  const suggestedTransform = useSelector(
    (state) => getMetabotSuggestedTransform(state, transform.id) as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  // TODO: should getMetabotSuggestedTransform selector do this?
  const isPropsedSame = _.isEqual(suggestedTransform?.source, initialSource);
  const proposedSource = isPropsedSame ? undefined : suggestedTransform?.source;

  useRegisterMetabotContextProvider(async () => {
    const viewedTransform = suggestedTransform ?? { ...transform, source };
    return { user_is_viewing: [{ type: "transform", ...viewedTransform }] };
  }, [transform, source, suggestedTransform]);

  const onRejectProposed = () => {
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  };
  const onAcceptProposed = async (source: TransformSource) => {
    setSource(source);
    dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
  };

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
        dispatch(deactivateSuggestedTransform(suggestedTransform?.id));
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
    dispatch(push(getTransformUrl(transform.id)));
  };

  if (transform.source.type === "python") {
    return (
      <AdminSettingsLayout fullWidth key={transform.id}>
        <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
          initialSource={transform.source}
          proposedSource={
            proposedSource?.type === "python" ? proposedSource : undefined
          }
          isNew={false}
          isSaving={isSaving}
          onSave={handleSaveSource}
          onCancel={handleCancel}
          onRejectProposed={onRejectProposed}
          onAcceptProposed={onAcceptProposed}
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
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
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
