/* eslint-disable react/prop-types */
import React, { useState } from "react";

import * as Urls from "metabase/lib/urls";

import { PageWrapper } from "metabase/collections/components/Layout";
import CollectionContent from "metabase/collections/containers/CollectionContent";
import CollectionSidebar from "metabase/collections/containers/CollectionSidebar/CollectionSidebar";
import { ContentBox } from "./CollectionLanding.styled";

const CollectionLanding = ({ params: { slug }, children }) => {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const handleToggleMobileSidebar = () =>
    setShowMobileSidebar(!showMobileSidebar);

  const collectionId = Urls.extractCollectionId(slug);
  const isRoot = collectionId === "root";

  return (
    <PageWrapper>
      <CollectionSidebar
        isRoot={isRoot}
        handleToggleMobileSidebar={handleToggleMobileSidebar}
        collectionId={collectionId}
        showMobileSidebar={showMobileSidebar}
      />
      {/* For now I'm wrapping this here so that we could potentially reuse CollectionContent without
        having the specific page margin and layout concerns, TBD whether that's a good idea or needed
        */}
      <ContentBox className="border-left" showMobileSidebar={showMobileSidebar}>
        <CollectionContent
          isRoot={isRoot}
          collectionId={collectionId}
          handleToggleMobileSidebar={handleToggleMobileSidebar}
          showMobileSidebar={showMobileSidebar}
        />
      </ContentBox>
      {
        // Need to have this here so the child modals will show up
        children
      }
    </PageWrapper>
  );
};

export default CollectionLanding;
