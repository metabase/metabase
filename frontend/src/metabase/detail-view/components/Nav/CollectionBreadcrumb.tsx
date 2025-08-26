import { useGetCollectionQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import type { CollectionId } from "metabase-types/api";

import { Breadcrumb } from "./Breadcrumb";
import { Separator } from "./Separator";

interface Props {
  collectionId: CollectionId;
}

export const CollectionBreadcrumb = ({ collectionId }: Props) => {
  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  if (!collection) {
    return null;
  }

  return (
    <>
      <Breadcrumb href={Urls.collection(collection)} icon="folder">
        {collection.name}
      </Breadcrumb>

      <Separator />
    </>
  );
};
