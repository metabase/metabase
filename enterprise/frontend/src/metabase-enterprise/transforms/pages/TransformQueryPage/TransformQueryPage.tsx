import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { TransformQueryEditor } from "metabase-enterprise/transforms/components/TransformQueryEditor";
import { getTransformUrl } from "metabase-enterprise/transforms/urls";
import type { DatasetQuery, Transform } from "metabase-types/api";

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
    <TransformQueryEditor
      query={transform.source.query}
      isNew={false}
      isSaving={isLoading}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
