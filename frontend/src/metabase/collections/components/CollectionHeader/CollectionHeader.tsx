import React from "react";
import { Collection } from "metabase-types/api";
import CollectionCaption from "./CollectionCaption";
import CollectionBookmark from "./CollectionBookmark";
import CollectionMenu from "./CollectionMenu";
import CollectionTimeline from "./CollectionTimeline";
import { HeaderRoot } from "./CollectionHeader.styled";

export interface CollectionHeaderProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
  isPersonalCollectionChild: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionHeader = ({
  collection,
  isAdmin,
  isBookmarked,
  isPersonalCollectionChild,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <CollectionCaption collection={collection} />
      <div>
        <CollectionBookmark
          collection={collection}
          isBookmarked={isBookmarked}
          onCreateBookmark={onCreateBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
        <CollectionTimeline collection={collection} />
        <CollectionMenu
          collection={collection}
          isAdmin={isAdmin}
          isPersonalCollectionChild={isPersonalCollectionChild}
        />
      </div>
    </HeaderRoot>
  );
};

export default CollectionHeader;
