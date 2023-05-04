import React, { ReactNode, useEffect } from "react";
import { extractCollectionId } from "metabase/lib/urls";
import { useDispatch } from "metabase/lib/redux";
import { setLastSeenCollection } from "metabase/home/actions";
import CollectionContent from "../../containers/CollectionContent";

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

  const collectionId = extractCollectionId(slug);
  const isRoot = collectionId === "root";

  useEffect(() => {
    dispatch(setLastSeenCollection(collectionId));
  }, [collectionId, dispatch]);

  return (
    <>
      <CollectionContent isRoot={isRoot} collectionId={collectionId} />
      {children}
    </>
  );
};

export default CollectionLanding;
