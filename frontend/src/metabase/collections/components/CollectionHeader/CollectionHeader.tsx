import { useUpdateCollectionMutation } from "metabase/api";
import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isTrashedCollection,
} from "metabase/common/collections/utils";
import { Flex } from "metabase/ui";
import type { Collection, UpdateCollectionRequest } from "metabase-types/api";

import { CollectionMenu } from "../CollectionMenu";

import CollectionBookmark from "./CollectionBookmark";
import { CollectionCaption } from "./CollectionCaption";
import { CollectionExportAnalytics } from "./CollectionExportAnalytics";
import S from "./CollectionHeader.module.css";
import { CollectionInfoSidebarToggle } from "./CollectionInfoSidebarToggle";
import { CollectionNewButton } from "./CollectionNewButton";
import { CollectionPermissions } from "./CollectionPermissions";
import CollectionTimeline from "./CollectionTimeline";
import { CollectionUpload } from "./CollectionUpload";

export interface CollectionHeaderProps {
  collection: Collection;
  isAdmin: boolean;
  isBookmarked: boolean;
  onCreateBookmark: (collection: Collection) => void;
  onDeleteBookmark: (collection: Collection) => void;
  canUpload: boolean;
  uploadsEnabled: boolean;
  onSaveFile: (file: File) => void;
}

export const CollectionHeader = ({
  collection,
  isAdmin,
  isBookmarked,
  onCreateBookmark,
  onDeleteBookmark,
  onSaveFile,
  canUpload,
  uploadsEnabled,
}: CollectionHeaderProps): JSX.Element => {
  const [updateCollection] = useUpdateCollectionMutation();

  const handleUpdateCollection = (
    collection: Collection,
    values: Partial<Collection>,
  ) =>
    // Header edits (rename, description, official marker) only target concrete
    // writable collections and send fields the update API accepts.
    updateCollection({
      id: collection.id,
      ...values,
    } as UpdateCollectionRequest);

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
    <Flex
      justify="space-between"
      direction={{ base: "column", sm: "row" }}
      align={{ base: "stretch", sm: "center" }}
      mb="xxl"
      pt={{ base: "xxs", sm: "sm" }}
    >
      <CollectionCaption
        collection={collection}
        onUpdateCollection={handleUpdateCollection}
      />
      {!isTrash && !isSemanticLayer && (
        <Flex
          className={S.actions}
          mt="sm"
          gap="sm"
          data-testid="collection-menu"
        >
          {showNewButton && <CollectionNewButton />}
          {showUploadButton && (
            <CollectionUpload
              collection={collection}
              uploadsEnabled={uploadsEnabled}
              isAdmin={isAdmin}
              onSaveFile={onSaveFile}
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
            onUpdateCollection={handleUpdateCollection}
          />
          {showCollectionMenu && (
            <CollectionMenu
              collection={collection}
              isAdmin={isAdmin}
              onUpdateCollection={handleUpdateCollection}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
};
