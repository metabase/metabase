import { useAsync } from "react-use";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import Questions from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useGetTransformQuery } from "metabase-enterprise/api";

import { TransformQuerySettings } from "./TransformQuerySettings";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
};

export function TransformQueryPage({ params }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const dispatch = useDispatch();

  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);

  const { loading: isLoadingMetadata, error: metadataError } =
    useAsync(async () => {
      if (transform != null) {
        await dispatch(
          Questions.actions.fetchAdhocMetadata(transform.source.query),
        );
      }
    }, [transform?.source.query]);

  const isLoading = isLoadingTransform || isLoadingMetadata;
  const error = transformError ?? metadataError;
  if (transform == null || isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <TransformQuerySettings transform={transform} />;
}
