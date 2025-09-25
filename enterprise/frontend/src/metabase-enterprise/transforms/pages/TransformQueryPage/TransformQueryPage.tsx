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
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import {
  getMetabotSuggestedTransform,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type {
  QueryTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

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
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const metabot = useMetabotAgent();

  const initialSource = transform.source;
  const [source, setSource] = useState(initialSource);

  const suggestedTransform = useSelector(
    (state) => getMetabotSuggestedTransform(state, transform.id) as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const proposedSource = suggestedTransform?.source;

  useRegisterMetabotContextProvider(async () => {
    const viewedTransform = suggestedTransform ?? { ...transform, source };
    return { user_is_viewing: [{ type: "transform", ...viewedTransform }] };
  }, [transform, source, suggestedTransform]);

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

  const handleCancel = () => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  if (transform.source.type === "python") {
    return (
      <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
        initialSource={transform.source}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSourceSave}
        onCancel={handleCancel}
      />
    );
  }

  const proposedQuerySource: QueryTransformSource | undefined =
    proposedSource?.type === "query" &&
    proposedSource?.query.type === "native" &&
    initialSource.type === "query" &&
    initialSource.query.type === "native" &&
    proposedSource.query.native.query === initialSource.query.native.query
      ? undefined
      : // TODO: fix type cast
        (proposedSource as QueryTransformSource | undefined);

  return (
    <AdminSettingsLayout fullWidth key={transform.id}>
      <QueryEditor
        initialSource={transform.source}
        transform={transform}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSourceSave}
        onChange={setSource}
        onCancel={handleCancel}
        proposedSource={proposedQuerySource}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
    </AdminSettingsLayout>
  );
}
