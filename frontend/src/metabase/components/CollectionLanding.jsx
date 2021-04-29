/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";

import CollectionContent from "metabase/collections/containers/CollectionContent";
import CollectionSidebar from "metabase/collections/containers/CollectionSidebar";

import { PageWrapper } from "metabase/collections/components/Layout";

const CollectionLanding = ({ params: { collectionId }, children }) => {
  const isRoot = collectionId === "root";

  // This ref is passed to VirtualizedList inside CollectionContent
  // List's scroll should not be attached to window (as by default)
  // as it would break NavBar's and Sidebar's layout
  const collectionContentContainerRef = React.useRef();

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
        innerRef={collectionContentContainerRef}
      >
        <CollectionContent
          isRoot={isRoot}
          collectionId={collectionId}
          scrollElement={collectionContentContainerRef.current}
        />
      </Box>
      {
        // Need to have this here so the child modals will show up
        children
      }
    </PageWrapper>
  );
};

export default CollectionLanding;
