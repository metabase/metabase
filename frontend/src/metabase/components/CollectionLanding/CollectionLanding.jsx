/* eslint-disable react/prop-types */
import React, { useState } from "react";

import { extractCollectionId } from "metabase/lib/urls";

import { PageWrapper } from "metabase/collections/components/Layout";
import CollectionContent from "metabase/collections/containers/CollectionContent";
import { ContentBox } from "./CollectionLanding.styled";

const CollectionLanding = ({ params: { slug }, children }) => {
  const [shouldDisplayMobileSidebar, setShouldDisplayMobileSidebar] = useState(
    false,
  );

  const handleToggleMobileSidebar = () =>
    setShouldDisplayMobileSidebar(!shouldDisplayMobileSidebar);

  const collectionId = extractCollectionId(slug);
  const isRoot = collectionId === "root";

  return (
    <PageWrapper>
      <ContentBox shouldDisplayMobileSidebar={shouldDisplayMobileSidebar}>
        <CollectionContent
          isRoot={isRoot}
          collectionId={collectionId}
          handleToggleMobileSidebar={handleToggleMobileSidebar}
          shouldDisplayMobileSidebar={shouldDisplayMobileSidebar}
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
