import React from "react";
import { Box } from "grid-styled";

/*
3rd party
metabase lib
metabase entities
metabase core components
feature / directory related containers
feature / directory related components
feature / directory related constants or utils

whenever possible use the full path in imports

ways you'll know

if you're importing the top level styled-components lib in a file that also has connect'd components you're most likely 
not separating things right

X/containers contains data fetching logic
X/components should contain display only components that accept props but don't directly call functions

it's ok to have a container component that does its own display if it's under 10-20 lines and has no new subcomponents

*/

import CollectionContent from "metabase/collections/containers/CollectionContent";
import CollectionSidebar from "metabase/collections/containers/CollectionSidebar";

import { PageWrapper } from "metabase/collections/components/Layout";

const CollectionLanding = () => {
  const {
    params: { collectionId },
  } = this.props;

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
        this.props.children
      }
    </PageWrapper>
  );
};

export default CollectionLanding;
