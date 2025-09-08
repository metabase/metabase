import { useState } from "react";
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
import Question from "metabase-lib/v1/Question";
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
  // TODO: move into redux state

  const [proposedQuery, setProposedQuery] = useState<DatasetQuery | undefined>(
    () => getProposedQuery(initialQuery),
  );
  const clearProposed = () => setProposedQuery(undefined);

  return (
    <QueryEditor
      initialQuery={initialQuery}
      isNew={false}
      isSaving={isLoading}
      onSave={handleSave}
      onCancel={handleCancel}
      proposedQuery={proposedQuery}
      clearProposed={clearProposed}
    />
  );
}

// TODO: factor in metabot state
function getProposedQuery(initialQuery: DatasetQuery | undefined) {
  return Question.create({
    type: "native",
    dataset_query: {
      database: initialQuery?.database ?? null,
      type: "native",
      native: {
        query: "SELECT * FROM ORDERS;",
      },
    },
  }).datasetQuery();
}
