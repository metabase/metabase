import { useGetCollectionQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import { CollectionContent } from "../CollectionContent";
import { CollectionContentSkeleton } from "../CollectionContent/CollectionContentSkeleton";

export const TrashCollectionLanding = () => {
  const { data, isLoading, error } = useGetCollectionQuery({ id: "trash" });

  if (isLoading) {
    return <CollectionContentSkeleton />;
  }

  return (
    <LoadingAndErrorWrapper error={error} noWrapper>
      {data && <CollectionContent collectionId={data.id} />}
    </LoadingAndErrorWrapper>
  );
};
