import React from "react";
import { withRouter } from "react-router";
import type { Location } from "history";

import { Collection } from "metabase-types/api";

import CollectionCaption from "./CollectionCaption";
import CollectionBookmark from "./CollectionBookmark";
import CollectionMenu from "./CollectionMenu";
import CollectionTimeline from "./CollectionTimeline";
import CollectionUpload from "./CollectionUpload";

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
  onUploadCSV: (file: File, collectionId: string) => void;
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
  onUploadCSV,
}: CollectionHeaderProps): JSX.Element => {
  const canUpload = true; // TODO: check settings for upload permissions

  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onUpdateCollection={onUpdateCollection}
      />
      <HeaderActions data-testid="collection-menu">
        <CollectionTimeline collection={collection} />
        <CollectionBookmark
          collection={collection}
          isBookmarked={isBookmarked}
          onCreateBookmark={onCreateBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
        {canUpload && (
          <CollectionUpload collection={collection} onUploadCSV={onUploadCSV} />
        )}
        <CollectionMenu
          collection={collection}
          isAdmin={isAdmin}
          isPersonalCollectionChild={isPersonalCollectionChild}
          onUpdateCollection={onUpdateCollection}
        />
      </HeaderActions>
    </HeaderRoot>
  );
};

export default withRouter(CollectionHeader);
