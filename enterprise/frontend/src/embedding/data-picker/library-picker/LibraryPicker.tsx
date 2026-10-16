import { useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { Box, Icon } from "metabase/ui";
import type {
  Collection,
  DatabaseId,
  LibraryCollection,
  TableId,
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
  tableId?: TableId;
  onSelect: (tableId: TableId) => void;
  onBack: () => void;
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
  tableId,
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
        scopeCollection={selectedFolder.collection}
        tableId={tableId}
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
      <a
        className={SavedEntityPickerS.BackButton}
        onClick={onBack}
        data-testid="library-picker-back-navigation"
      >
        <Icon name="chevronleft" className={CS.mr1} />
        {libraryCollection.name}
      </a>
      <Box p="sm">
        <DataSelectorDataBucketPicker
          dataTypes={folders.map((folder) => folder.infoItem)}
          onChangeDataBucket={setSelectedFolderId}
        />
      </Box>
    </Box>
  );
}

function getLibraryFolders(
  children: Collection[],
  { canSelectMetric }: { canSelectMetric: boolean },
) {
  return children.flatMap((collection) => {
    const folder = getLibraryFolder(collection);
    const contents = [...(collection.here ?? []), ...(collection.below ?? [])];
    const isSelectable =
      folder != null &&
      contents.includes(folder.type) &&
      (folder.type !== "metric" || canSelectMetric);

    return isSelectable ? [{ ...folder, collection }] : [];
  });
}

function getLibraryFolder(collection: Collection) {
  switch (collection.type) {
    case "library-data":
      return { type: "table" as const, infoItem: LIBRARY_DATA_INFO_ITEM };
    case "library-metrics":
      return { type: "metric" as const, infoItem: LIBRARY_METRICS_INFO_ITEM };
    default:
      // Dashboards also live in the Library, but aren't data sources
      return null;
  }
}
