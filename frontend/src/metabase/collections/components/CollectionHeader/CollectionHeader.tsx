import { useUpdateCollectionMutation } from "metabase/api";
import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isTrashedCollection,
} from "metabase/common/collections/utils";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { Collection, UpdateCollectionRequest } from "metabase-types/api";

import { CollectionMenu } from "../CollectionMenu";

import CollectionBookmark from "./CollectionBookmark";
import { CollectionCaption } from "./CollectionCaption";
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
  /** Offers only the bookmark and the info sidebar, and no edits to the collection. */
  readOnly?: boolean;
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
  readOnly = false,
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

  const showNewButton =
    hasCuratePermissions && !isInstanceAnalytics && !readOnly;
  const showUploadButton =
    collection.can_write && (canUpload || !uploadsEnabled) && !readOnly;
  const showExportButton = isInstanceAnalytics && isAdmin && showUploadButton;
  const showTimelinesButton = !isInstanceAnalytics && !readOnly;
  const showCollectionMenu =
    !isInstanceAnalytics && !isSemanticLayer && !readOnly;

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
        readOnly={readOnly}
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
          {showExportButton && <PLUGIN_AUDIT.CollectionExportAnalytics />}
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
            readOnly={readOnly}
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
