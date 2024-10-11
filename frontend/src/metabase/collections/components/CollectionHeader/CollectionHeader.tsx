import { withRouter } from "react-router";

import {
  isInstanceAnalyticsCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import type { Collection } from "metabase-types/api";

import { CollectionMenu } from "../CollectionMenu";

import CollectionBookmark from "./CollectionBookmark";
import { CollectionCaption } from "./CollectionCaption";
import { HeaderActions, HeaderRoot } from "./CollectionHeader.styled";
import { CollectionInfoSidebarToggle } from "./CollectionInfoSidebarToggle";
import { CollectionPermissions } from "./CollectionPermissions";
import CollectionTimeline from "./CollectionTimeline";
import { CollectionUpload } from "./CollectionUpload";

export interface CollectionHeaderProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
  isPersonalCollectionChild: boolean;
  onUpdateCollection: (entity: Collection, values: Partial<Collection>) => void;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
  canUpload: boolean;
  uploadsEnabled: boolean;
  saveFile: (file: File) => void;
}

const CollectionHeader = ({
  collection,
  isAdmin,
  isBookmarked,
  isPersonalCollectionChild,
  onUpdateCollection,
  onCreateBookmark,
  onDeleteBookmark,
  saveFile,
  canUpload,
  uploadsEnabled,
}: CollectionHeaderProps): JSX.Element => {
  const isTrash = isTrashedCollection(collection);
  const showUploadButton =
    collection.can_write && (canUpload || !uploadsEnabled);
  const isInstanceAnalytics = isInstanceAnalyticsCollection(collection);

  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onUpdateCollection={onUpdateCollection}
      />
      {!isTrash && (
        <HeaderActions data-testid="collection-menu">
          {showUploadButton && (
            <CollectionUpload
              collection={collection}
              uploadsEnabled={uploadsEnabled}
              isAdmin={isAdmin}
              saveFile={saveFile}
            />
          )}
          {!isInstanceAnalytics && (
            <CollectionTimeline collection={collection} />
          )}
          {isInstanceAnalytics && (
            <CollectionPermissions collection={collection} />
          )}
          <CollectionBookmark
            collection={collection}
            isBookmarked={isBookmarked}
            onCreateBookmark={onCreateBookmark}
            onDeleteBookmark={onDeleteBookmark}
          />
          <CollectionInfoSidebarToggle
            collection={collection}
            onUpdateCollection={onUpdateCollection}
          />
          {!isInstanceAnalytics && (
            <CollectionMenu
              collection={collection}
              isAdmin={isAdmin}
              isPersonalCollectionChild={isPersonalCollectionChild}
              onUpdateCollection={onUpdateCollection}
            />
          )}
        </HeaderActions>
      )}
    </HeaderRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default withRouter(CollectionHeader);
