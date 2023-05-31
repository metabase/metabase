import { withRouter } from "react-router";
import type { Location } from "history";

import { Collection, CollectionId } from "metabase-types/api";

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
  onUpload: (file: File, collectionId: CollectionId) => void;
  canUpload: boolean;
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
  onUpload,
  canUpload,
}: CollectionHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onUpdateCollection={onUpdateCollection}
      />
      <HeaderActions data-testid="collection-menu">
        {canUpload && (
          <CollectionUpload collection={collection} onUpload={onUpload} />
        )}
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
          onUpdateCollection={onUpdateCollection}
        />
      </HeaderActions>
    </HeaderRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default withRouter(CollectionHeader);
