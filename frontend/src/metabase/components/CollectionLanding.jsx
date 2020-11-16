import React from "react";
import { Box } from "grid-styled";

import CollectionContent from "metabase/collections/containers/CollectionContent";
import CollectionSidebar from "metabase/collections/containers/CollectionSidebar";

import { PageWrapper } from "metabase/collections/components/Layout";

const CollectionLanding = ({ params: { collectionId }, children }) => {
  const isRoot = collectionId === "root";

  return (
    <PageWrapper>
      <CollectionSidebar isRoot={isRoot} collectionId={collectionId} />
      {/* For now I'm wrapping this here so that we could potentially reuse CollectionContent without
        having the specific page margin and layout concerns, TBD whether that's a good idea or needed
        */}
      <Box
        bg="white"
        className="border-left full-height"
        style={{ overflowY: "auto" }}
        ml={340}
        pb={4}
      >
        <CollectionContent isRoot={isRoot} collectionId={collectionId} />
      </Box>
      {
        // Need to have this here so the child modals will show up
        children
      }
    </PageWrapper>
  );
};

export default CollectionLanding;
