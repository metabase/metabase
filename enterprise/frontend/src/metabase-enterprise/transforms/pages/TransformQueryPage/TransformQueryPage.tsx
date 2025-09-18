import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import {
  getMetabotSuggestedTransform,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type { Transform, TransformSource } from "metabase-types/api";

import { PythonTransformEditor } from "../../components/PythonTransformEditor";
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

  return (
    <AdminSettingsLayout fullWidth key={transform.id}>
      <TransformQueryPageBody transform={transform} />
    </AdminSettingsLayout>
  );
}

type TransformQueryPageBodyProps = {
  transform: Transform;
};

export function TransformQueryPageBody({
  transform,
}: TransformQueryPageBodyProps) {
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const metabot = useMetabotAgent();

  const initialSource = transform.source;
  const [latestSource, setLatestSource] =
    useState<TransformSource>(initialSource);

  const suggestedTransform = useSelector(
    (state) => getMetabotSuggestedTransform(state, transform.id) as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const proposedSource = suggestedTransform?.source;

  useRegisterMetabotContextProvider(async () => {
    const viewedTransform = suggestedTransform ?? {
      ...transform,
      source: latestSource,
    };
    return { user_is_viewing: [{ type: "transform", ...viewedTransform }] };
  }, [transform, latestSource, suggestedTransform]);

  const handleSourceSave = async (
    source: TransformSource,
    { leaveEditor } = { leaveEditor: true },
  ) => {
    const { error } = await updateTransform({
      id: transform.id,
      source,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform query`);
    } else {
      sendSuccessToast(t`Transform query updated`);
      if (leaveEditor) {
        dispatch(push(getTransformUrl(transform.id)));
      }
    }
  };

  const onRejectProposed = () => {
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput({
      type: "action",
      message:
        "HIDDEN MESSAGE: the user has rejected your changes, ask for clarification on what they'd like to do instead.",
      // @ts-expect-error -- TODO
      userMessage: "❌ You rejected the change",
    });
  };

  const onAcceptProposed = async (source: TransformSource) => {
    await handleSourceSave(source, { leaveEditor: false });
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput({
      type: "action",
      message:
        "HIDDEN MESSAGE: user has accepted your changes, move to the next step!",
      // @ts-expect-error -- TODO
      userMessage: "✅ You accepted the change",
    });
  };

  const handleCancel = () => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  if (transform.source.type === "python") {
    const pythonProposedSource =
      proposedSource?.type === "python" ? proposedSource : undefined;

    return (
      <PythonTransformEditor
        initialSource={transform.source}
        proposedSource={pythonProposedSource}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSourceSave}
        onCancel={handleCancel}
        onAcceptProposed={onAcceptProposed}
        onRejectProposed={onRejectProposed}
      />
    );
  }

  const queryProposedSource =
    proposedSource?.type === "query" ? proposedSource : undefined;

  return (
    <QueryEditor
      initialSource={transform.source}
      transform={transform}
      isNew={false}
      isSaving={isLoading}
      onSave={handleSourceSave}
      onChange={setLatestSource}
      onCancel={handleCancel}
      proposedSource={queryProposedSource}
      onRejectProposed={queryProposedSource ? onRejectProposed : undefined}
      onAcceptProposed={queryProposedSource ? onAcceptProposed : undefined}
    />
  );
}
