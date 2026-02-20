import type { ReactNode } from "react";
import { useEffect } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { extractCollectionId } from "metabase/lib/urls";
import { useNavigation } from "metabase/routing/compat";

import { CollectionContent } from "../CollectionContent";

export interface CollectionLandingProps {
  params: CollectionLandingParams;
  children?: ReactNode;
}

export interface CollectionLandingParams {
  slug: string;
}

const CollectionLanding = ({
  params: { slug },
  children,
}: CollectionLandingProps) => {
  const { replace } = useNavigation();
  const { data: trashCollection } = useGetCollectionQuery({ id: "trash" });

  const collectionId = extractCollectionId(slug);

  useEffect(
    function redirectIfTrashCollection() {
      // redirect /collection/trash and /collection/<trash-collection-id> to /trash
      const isTrashSlug = slug === "trash";
      const isTrashCollectionId =
        collectionId &&
        trashCollection?.id &&
        trashCollection.id === collectionId;

      if (isTrashSlug || isTrashCollectionId) {
        replace("/trash");
      }
    },
    [replace, slug, trashCollection?.id, collectionId],
  );

  if (!isNotNull(collectionId)) {
    return null;
  }

  return (
    <>
      <CollectionContent collectionId={collectionId} />
      {children}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionLanding;
