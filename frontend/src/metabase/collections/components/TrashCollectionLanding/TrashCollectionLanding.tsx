import { useGetCollectionQuery } from "metabase/api";
import Loading from "metabase/components/Loading";

import { CollectionContent } from "../CollectionContent";

export const TrashCollectionLanding = () => {
  const { data, isLoading, error } = useGetCollectionQuery({ id: "trash" });

  return (
    <Loading loading={isLoading} error={error}>
      {data && <CollectionContent collectionId={data.id} />}
    </Loading>
  );
};
