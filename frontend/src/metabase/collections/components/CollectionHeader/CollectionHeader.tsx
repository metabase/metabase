import React from "react";
import { withRouter } from "react-router";
import type { Location } from "history";

import { isDataAppCollection } from "metabase/entities/data-apps";

import { Collection } from "metabase-types/api";

import CollectionCaption from "./CollectionCaption";
import CollectionBookmark from "./CollectionBookmark";
import CollectionMenu from "./CollectionMenu";
import CollectionTimeline from "./CollectionTimeline";
import LaunchDataAppButton from "./LaunchDataAppButton";

import { HeaderActions, HeaderRoot } from "./CollectionHeader.styled";

export interface CollectionHeaderProps {
  collection: Collection;
  location: Location;
  isAdmin: boolean;
  isBookmarked: boolean;
  isPersonalCollectionChild: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionHeader = ({
  collection,
  location,
  isAdmin,
  isBookmarked,
  isPersonalCollectionChild,
  onUpdateCollection,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionHeaderProps): JSX.Element => {
  const isDataApp = isDataAppCollection(collection);

  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onUpdateCollection={onUpdateCollection}
      />
      <HeaderActions data-testid="collection-menu">
        {isDataApp && <LaunchDataAppButton collection={collection} />}
        <CollectionTimeline collection={collection} />
        <CollectionBookmark
          collection={collection}
          isBookmarked={isBookmarked}
          onCreateBookmark={onCreateBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
        <CollectionMenu
          collection={collection}
          isAdmin={isAdmin}
          isDataApp={isDataApp}
          isPersonalCollectionChild={isPersonalCollectionChild}
          onUpdateCollection={onUpdateCollection}
        />
      </HeaderActions>
    </HeaderRoot>
  );
};

export default withRouter(CollectionHeader);
