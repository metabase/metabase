import { useEffect } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
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
  const isTrashSlug = slug === "trash";

  useEffect(
    function redirectIfTrashCollection() {
      // redirect /collection/trash and /collection/<trash-collection-id> to /trash
      const isTrashCollectionId =
        collectionId &&
        trashCollection?.id &&
        trashCollection.id === collectionId;

      if (isTrashSlug || isTrashCollectionId) {
        navigate("/trash", { replace: true });
      }
    },
    [isTrashSlug, trashCollection?.id, collectionId, navigate],
  );

  // `/collection/trash` is on its way to `/trash`.
  if (isTrashSlug) {
    return null;
  }

  // A value that is not a collection ID would otherwise leave the page blank (metabase#78725).
  if (!isNotNull(collectionId)) {
    return <NotFound />;
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
