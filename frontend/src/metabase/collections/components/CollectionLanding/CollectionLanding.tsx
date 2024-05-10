import type { ReactNode } from "react";
import { useEffect } from "react";
import { replace } from "react-router-redux";

import { useGetCollectionQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { extractCollectionId } from "metabase/lib/urls";

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
  const dispatch = useDispatch();
  const { data: trashCollection } = useGetCollectionQuery("trash");

  const collectionId = extractCollectionId(slug);

  useEffect(
    function redirectIfTrashCollection() {
      if (trashCollection?.id === collectionId) {
        dispatch(replace("/trash"));
      }
    },
    [dispatch, trashCollection?.id, collectionId],
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
