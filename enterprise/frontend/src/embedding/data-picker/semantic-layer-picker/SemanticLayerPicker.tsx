import { useState } from "react";
import { t } from "ttag";

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
  SEMANTIC_LAYER_DATA_INFO_ITEM,
  SEMANTIC_LAYER_METRICS_INFO_ITEM,
} from "../constants";
import { SavedEntityPicker } from "../saved-entity-picker/SavedEntityPicker";
import SavedEntityPickerS from "../saved-entity-picker/SavedEntityPicker.module.css";
import { COLLECTION_TREE_REQUEST } from "../saved-entity-picker/constants";
import { findCollectionById } from "../saved-entity-picker/utils";
import type { DataTypeInfoItem } from "../types";

interface SemanticLayerPickerProps {
  libraryCollection: LibraryCollection;
  canSelectMetric: boolean;
  databaseId?: DatabaseId | null;
  tableId?: TableId;
  onSelect: (tableId: TableId) => void;
  /** Without it, there's no link back to the bucket step. */
  onBack?: () => void;
}

/**
 * Offers the semantic layer's Data and Metrics folders like the bucket step, then
 * opens the chosen one in `SavedEntityPicker`. A folder without tables or
 * metrics isn't offered, and when only one is left it opens straight away.
 */
export function SemanticLayerPicker({
  libraryCollection,
  canSelectMetric,
  databaseId,
  tableId,
  onSelect,
  onBack,
}: SemanticLayerPickerProps) {
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
        libraryFolder={selectedFolder.collection}
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
      {onBack && (
        <a
          className={SavedEntityPickerS.BackButton}
          onClick={onBack}
          data-testid="semantic-layer-picker-back-navigation"
        >
          <Icon name="chevronleft" className={CS.mr1} />
          {t`Semantic layer`}
        </a>
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
// out by `buildCollectionTree`, in `SavedEntityPicker.tsx`.
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
      return {
        type: "table" as const,
        infoItem: SEMANTIC_LAYER_DATA_INFO_ITEM,
      };
    case "library-metrics":
      return {
        type: "metric" as const,
        infoItem: SEMANTIC_LAYER_METRICS_INFO_ITEM,
      };
    default:
      return null;
  }
}
