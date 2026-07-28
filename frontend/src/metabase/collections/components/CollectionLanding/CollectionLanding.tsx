import { useEffect } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
import { Outlet, replace, useParams } from "metabase/router";
import { extractCollectionId } from "metabase/urls";
import { isNotNull } from "metabase/utils/types";

import { CollectionContent } from "../CollectionContent";

export type CollectionLandingParams = {
  slug: string;
};

const CollectionLanding = () => {
  const { slug } = useParams<CollectionLandingParams>();
  const dispatch = useDispatch();
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
        dispatch(replace("/trash"));
      }
    },
    [dispatch, slug, trashCollection?.id, collectionId],
  );

  if (!isNotNull(collectionId)) {
    return null;
  }

  return (
    <>
      <CollectionContent collectionId={collectionId} />
      <Outlet />
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionLanding;
