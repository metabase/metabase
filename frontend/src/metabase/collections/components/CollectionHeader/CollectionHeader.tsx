import { withRouter } from "react-router";

import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isTrashedCollection,
} from "metabase/collections/utils";
import type { Collection } from "metabase-types/api";

import { CollectionMenu } from "../CollectionMenu";

import CollectionBookmark from "./CollectionBookmark";
import { CollectionCaption } from "./CollectionCaption";
import { CollectionExportAnalytics } from "./CollectionExportAnalytics";
import { HeaderActions, HeaderRoot } from "./CollectionHeader.styled";
import { CollectionInfoSidebarToggle } from "./CollectionInfoSidebarToggle";
import { CollectionNewButton } from "./CollectionNewButton";
import { CollectionPermissions } from "./CollectionPermissions";
import CollectionTimeline from "./CollectionTimeline";
import { CollectionUpload } from "./CollectionUpload";

export interface CollectionHeaderProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
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
  onUpdateCollection,
  onCreateBookmark,
  onDeleteBookmark,
  saveFile,
  canUpload,
  uploadsEnabled,
}: CollectionHeaderProps): JSX.Element => {
  const isTrash = isTrashedCollection(collection);
  const isInstanceAnalytics = isInstanceAnalyticsCollection(collection);
  const isSemanticLayer = isLibraryCollection(collection);
  const hasCuratePermissions = !!collection?.can_write;

  const showNewButton = hasCuratePermissions && !isInstanceAnalytics;
  const showUploadButton =
    collection.can_write && (canUpload || !uploadsEnabled);
  const showExportButton = isInstanceAnalytics && isAdmin && showUploadButton;
  const showTimelinesButton = !isInstanceAnalytics;
  const showCollectionMenu = !isInstanceAnalytics && !isSemanticLayer;

  return (
    <HeaderRoot>
      <CollectionCaption
        collection={collection}
        onUpdateCollection={onUpdateCollection}
      />
      {!isTrash && !isSemanticLayer && (
        <HeaderActions data-testid="collection-menu">
          {showNewButton && <CollectionNewButton />}
          {showUploadButton && (
            <CollectionUpload
              collection={collection}
              uploadsEnabled={uploadsEnabled}
              isAdmin={isAdmin}
              saveFile={saveFile}
            />
          )}
          {showTimelinesButton && (
            <CollectionTimeline collection={collection} />
          )}
          {showExportButton && <CollectionExportAnalytics />}
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
          {showCollectionMenu && (
            <CollectionMenu
              collection={collection}
              isAdmin={isAdmin}
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
