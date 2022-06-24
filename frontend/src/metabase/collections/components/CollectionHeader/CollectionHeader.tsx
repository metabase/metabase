import React from "react";
import { Collection } from "metabase-types/api";
import CollectionCaption from "./CollectionCaption";
import CollectionBookmark from "./CollectionBookmark";
import CollectionMenu from "./CollectionMenu";
import CollectionTimeline from "./CollectionTimeline";
import { HeaderActions, HeaderRoot } from "./CollectionHeader.styled";

export interface CollectionHeaderProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
  isPersonalCollectionChild: boolean;
  onChangeName: (collection: Collection, name: string) => void;
  onChangeDescription: (collection: Collection, description: string) => void;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
}

const CollectionHeader = ({
  collection,
  isAdmin,
  isBookmarked,
  isPersonalCollectionChild,
  onChangeName,
  onChangeDescription,
  onCreateBookmark,
  onDeleteBookmark,
}: CollectionHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onChangeName={onChangeName}
        onChangeDescription={onChangeDescription}
      />
      <HeaderActions data-testid="collection-menu">
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
          isPersonalCollectionChild={isPersonalCollectionChild}
        />
      </HeaderActions>
    </HeaderRoot>
  );
};

export default CollectionHeader;
