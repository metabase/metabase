import { useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import { Box, Icon, UnstyledButton } from "metabase/ui";
import type {
  Collection,
  DatabaseId,
  LibraryCollection,
} from "metabase-types/api";

import { DataSelectorDataBucketPicker } from "../DataSelectorDataBucketPicker";
import {
  LIBRARY_DATA_INFO_ITEM,
  LIBRARY_METRICS_INFO_ITEM,
} from "../constants";
import { SavedEntityPicker } from "../saved-entity-picker/SavedEntityPicker";
import SavedEntityPickerS from "../saved-entity-picker/SavedEntityPicker.module.css";
import { COLLECTION_TREE_REQUEST } from "../saved-entity-picker/constants";
import { findCollectionById } from "../saved-entity-picker/utils";
import type { DataTypeInfoItem } from "../types";

interface LibraryPickerProps {
  libraryCollection: LibraryCollection;
  canSelectMetric: boolean;
  databaseId?: DatabaseId | null;
  selectedSource?: DataSource;
  onSelect: (source: DataSource) => void;
  /** Without it, there's no link back to the bucket step. */
  onBack?: () => void;
}

/**
 * Offers the Library's Data and Metrics folders like the bucket step, then
 * opens the chosen one in `SavedEntityPicker`. A folder without tables or
 * metrics isn't offered, and when only one is left it opens straight away.
 */
export function LibraryPicker({
  libraryCollection,
  canSelectMetric,
  databaseId,
  selectedSource,
  onSelect,
  onBack,
}: LibraryPickerProps) {
  const { data: collections } = useListCollectionsTreeQuery(
    COLLECTION_TREE_REQUEST,
  );
  const [selectedFolderId, setSelectedFolderId] =
    useState<DataTypeInfoItem["id"]>();

  if (!collections) {
    return null;
  }

  const libraryNode = findCollectionById(collections, libraryCollection.id);
  const folders = getLibraryFolders(libraryNode?.children ?? [], {
    canSelectMetric,
  });
  const selectedFolder =
    folders.length === 1
      ? folders[0]
      : folders.find((folder) => folder.infoItem.id === selectedFolderId);

  if (selectedFolder) {
    return (
      <SavedEntityPicker
        type={selectedFolder.type}
        libraryFolders={selectedFolder.collections}
        selectedSource={selectedSource}
        databaseId={databaseId}
        onSelect={onSelect}
        onBack={
          folders.length === 1 ? onBack : () => setSelectedFolderId(undefined)
        }
      />
    );
  }

  return (
    <Box>
      {onBack && (
        <UnstyledButton
          className={SavedEntityPickerS.BackButton}
          onClick={onBack}
          data-testid="library-picker-back-navigation"
        >
          <Icon name="chevronleft" className={CS.mr1} aria-hidden />
          {libraryCollection.name}
        </UnstyledButton>
      )}
      <Box p="sm">
        <DataSelectorDataBucketPicker
          dataTypes={folders.map((folder) => folder.infoItem)}
          onChangeDataBucket={setSelectedFolderId}
        />
      </Box>
    </Box>
  );
}

// Only Data and Metrics hold data sources. Empty subfolders inside them are left
// out by `buildCollectionTree`, in `SavedEntityPicker.tsx`. When the user can't
// read the Data or Metrics folder, the collection tree lifts its readable
// subfolders into the Library, so a folder can be several collections.
function getLibraryFolders(
  children: Collection[],
  { canSelectMetric }: { canSelectMetric: boolean },
) {
  return LIBRARY_FOLDER_KINDS.flatMap(({ collectionType, type, infoItem }) => {
    if (type === "metric" && !canSelectMetric) {
      return [];
    }

    const collections = children.filter(
      (collection) =>
        collection.type === collectionType &&
        [...(collection.here ?? []), ...(collection.below ?? [])].includes(
          type,
        ),
    );

    return collections.length > 0 ? [{ type, infoItem, collections }] : [];
  });
}

const LIBRARY_FOLDER_KINDS = [
  {
    collectionType: "library-data",
    type: "table",
    infoItem: LIBRARY_DATA_INFO_ITEM,
  },
  {
    collectionType: "library-metrics",
    type: "metric",
    infoItem: LIBRARY_METRICS_INFO_ITEM,
  },
] as const;
