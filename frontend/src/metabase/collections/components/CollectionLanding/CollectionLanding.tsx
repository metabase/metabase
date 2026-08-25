import { useEffect } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { Outlet, useNavigate, useParams } from "metabase/router";
import { extractCollectionId } from "metabase/urls";
import { isNotNull } from "metabase/utils/types";

import { CollectionContent } from "../CollectionContent";

export type CollectionLandingParams = {
  slug: string;
};

const CollectionLanding = () => {
  const { slug } = useParams<CollectionLandingParams>();
  const navigate = useNavigate();
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
        navigate("/trash", { replace: true });
      }
    },
    [slug, trashCollection?.id, collectionId, navigate],
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
