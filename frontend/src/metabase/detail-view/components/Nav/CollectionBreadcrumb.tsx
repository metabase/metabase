import { useGetCollectionQuery } from "metabase/api";
import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

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
      <Breadcrumb
        color="text-secondary"
        icon="folder"
        to={Urls.collection(collection)}
        showTooltip
      >
        {collection.name}
      </Breadcrumb>

      <Separator />
    </>
  );
};
