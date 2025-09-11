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
import type { DatasetQuery, Transform } from "metabase-types/api";

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

  const initialQuery = transform.source.query;
  const [latestQuery, setLatestQuery] = useState<DatasetQuery>(initialQuery);

  const suggestedTransform = useSelector(
    (state) => getMetabotSuggestedTransform(state, transform.id) as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const proposedQuery = suggestedTransform?.source.query;

  useRegisterMetabotContextProvider(async () => {
    const viewedTransform = suggestedTransform ?? {
      ...transform,
      source: { ...transform.source, query: latestQuery },
    };
    return { user_is_viewing: [{ type: "transform", ...viewedTransform }] };
  }, [transform, latestQuery, suggestedTransform]);

  const onRejectProposed = () => {
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput(
      "HIDDEN MESSAGE: user has rejected your changes, ask for clarification on what they'd like to do instead.",
    );
  };
  const onAcceptProposed = async (query: DatasetQuery) => {
    await handleSave(query);
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput(
      "HIDDEN MESSAGE: user has accepted your changes, move to the next step!",
    );
  };

  const handleSave = async (query: DatasetQuery) => {
    const { error } = await updateTransform({
      id: transform.id,
      source: {
        type: "query",
        query,
      },
    });

    if (error) {
      sendErrorToast(t`Failed to update transform query`);
    } else {
      sendSuccessToast(t`Transform query updated`);
      dispatch(push(getTransformUrl(transform.id)));
    }
  };

  const handleCancel = () => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <AdminSettingsLayout fullWidthContent>
      <QueryEditor
        initialQuery={initialQuery}
        transform={transform}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSave}
        onChange={setLatestQuery}
        onCancel={handleCancel}
        proposedQuery={proposedQuery}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
    </AdminSettingsLayout>
  );
}
