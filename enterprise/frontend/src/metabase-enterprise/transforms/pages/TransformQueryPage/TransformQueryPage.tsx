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
import {
  getMetabotSuggestedTransform,
  setTransformQuery,
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

  useRegisterMetabotContextProvider(async () => {
    return transform
      ? { user_is_viewing: [{ type: "transform", ...transform }] }
      : {};
  }, [transform]);

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

  const initialQuery = transform.source.query;

  const { transformQuery: proposedQuery } = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  const clearProposed = () => dispatch(setTransformQuery(undefined));

  return (
    <AdminSettingsLayout fullWidthContent>
      <QueryEditor
        initialQuery={initialQuery}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSave}
        onCancel={handleCancel}
        proposedQuery={proposedQuery}
        clearProposed={clearProposed}
      />
    </AdminSettingsLayout>
  );
}
