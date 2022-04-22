/* eslint-disable react/prop-types */
import React from "react";

import { extractCollectionId } from "metabase/lib/urls";

import CollectionContent from "metabase/collections/containers/CollectionContent";
import { ContentBox } from "./CollectionLanding.styled";

const CollectionLanding = ({ params: { slug }, children }) => {
  const collectionId = extractCollectionId(slug);
  const isRoot = collectionId === "root";

  return (
    <>
      <ContentBox>
        <CollectionContent isRoot={isRoot} collectionId={collectionId} />
      </ContentBox>
      {
        // Need to have this here so the child modals will show up
        children
      }
    </>
  );
};

export default CollectionLanding;
