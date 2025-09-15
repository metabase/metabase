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
import { PythonTransformEditor } from "metabase-enterprise/transforms/components/PythonTransformEditor";
import type {
  DatasetQuery,
  PythonTransformSource,
  Transform,
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

  const handleDatasetSave = async (query: DatasetQuery) => {
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

  const handlePythonSave = async (source: PythonTransformSource) => {
    const { error } = await updateTransform({
      id: transform.id,
      source: source,
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

  if (transform.source.type === "python") {
    return (
      <PythonTransformEditor
        initialSource={transform.source}
        isNew={false}
        isSaving={isLoading}
        onSave={handlePythonSave}
        onCancel={handleCancel}
      />
    );
  }
  return (
    <QueryEditor
      initialQuery={transform.source.query}
      isNew={false}
      isSaving={isLoading}
      onSave={handleDatasetSave}
      onCancel={handleCancel}
    />
  );
}
