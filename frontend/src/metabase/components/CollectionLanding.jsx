/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "grid-styled";
import styled from "styled-components";

import CollectionContent from "metabase/collections/containers/CollectionContent";
import CollectionSidebar from "metabase/collections/containers/CollectionSidebar/CollectionSidebar";

import * as Urls from "metabase/lib/urls";

import { PageWrapper } from "metabase/collections/components/Layout";

const sidebarWidth = "340px";

const ContentBox = styled(Box)`
  background-color: white;
  height: 100%;
  margin-left: ${sidebarWidth};
  overflow-y: auto;
  padding-bottom: 64px;
`;

const CollectionLanding = ({ params: { slug }, children }) => {
  const collectionId = Urls.extractCollectionId(slug);
  const isRoot = collectionId === "root";

  return (
    <PageWrapper>
      <CollectionSidebar
        isRoot={isRoot}
        collectionId={collectionId}
        width={sidebarWidth}
      />
      {/* For now I'm wrapping this here so that we could potentially reuse CollectionContent without
        having the specific page margin and layout concerns, TBD whether that's a good idea or needed
        */}
      <ContentBox className="border-left">
        <CollectionContent isRoot={isRoot} collectionId={collectionId} />
      </ContentBox>
      {
        // Need to have this here so the child modals will show up
        children
      }
    </PageWrapper>
  );
};

export default CollectionLanding;
