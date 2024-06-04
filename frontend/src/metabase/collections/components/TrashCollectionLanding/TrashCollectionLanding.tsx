import { useGetCollectionQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { CollectionContent } from "../CollectionContent";

export const TrashCollectionLanding = () => {
  const { data, isLoading, error } = useGetCollectionQuery("trash");

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      {data && <CollectionContent collectionId={data.id} />}
    </LoadingAndErrorWrapper>
  );
};
