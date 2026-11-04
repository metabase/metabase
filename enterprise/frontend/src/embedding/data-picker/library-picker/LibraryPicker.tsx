import { useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import { Box, Icon, UnstyledButton } from "metabase/ui";
import type {
  Collection,
  CollectionId,
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
  /** Opens the Data or Metrics collection holding this collection, and lists it. */
  collectionId?: CollectionId | null;
  onSelect: (source: DataSource) => void;
  /** Without it, there's no link back to the bucket step. */
  onBack?: () => void;
}

/**
 * Offers the Library's Data and Metrics collections like the bucket step, then
 * opens the chosen one in `SavedEntityPicker`. A collection without tables or
 * metrics isn't offered, and when only one is left it opens straight away.
 */
export function LibraryPicker({
  libraryCollection,
  canSelectMetric,
  databaseId,
  selectedSource,
  collectionId,
  onSelect,
  onBack,
}: LibraryPickerProps) {
  const { data: collections } = useListCollectionsTreeQuery(
    COLLECTION_TREE_REQUEST,
  );
  // `null` once the user went back from the collection opened for `collectionId`
  const [selectedCollectionKindId, setSelectedCollectionKindId] = useState<
    DataTypeInfoItem["id"] | null
  >();

  if (!collections) {
    return null;
  }

  const libraryNode = findCollectionById(collections, libraryCollection.id);
  const collectionKinds = getLibraryCollectionKinds(
    libraryNode?.children ?? [],
    { canSelectMetric },
  );
  const selectedCollectionKind =
    collectionKinds.length === 1
      ? collectionKinds[0]
      : collectionKinds.find((collectionKind) =>
          selectedCollectionKindId === undefined
            ? collectionId != null &&
              findCollectionById(collectionKind.collections, collectionId)
            : collectionKind.infoItem.id === selectedCollectionKindId,
        );

  if (selectedCollectionKind) {
    return (
      <SavedEntityPicker
        type={selectedCollectionKind.type}
        libraryCollections={selectedCollectionKind.collections}
        selectedSource={selectedSource}
        collectionId={collectionId}
        databaseId={databaseId}
        onSelect={onSelect}
        onBack={
          collectionKinds.length === 1
            ? onBack
            : () => setSelectedCollectionKindId(null)
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
          dataTypes={collectionKinds.map(
            (collectionKind) => collectionKind.infoItem,
          )}
          onChangeDataBucket={setSelectedCollectionKindId}
        />
      </Box>
    </Box>
  );
}

// Only Data and Metrics hold data sources. Empty subcollections inside them are
// left out by `buildCollectionTree`, in `SavedEntityPicker.tsx`. When the user
// can't read the Data or Metrics collection, the collection tree lifts its
// readable subcollections into the Library, so a kind can be several collections.
function getLibraryCollectionKinds(
  children: Collection[],
  { canSelectMetric }: { canSelectMetric: boolean },
) {
  return LIBRARY_COLLECTION_KINDS.flatMap(
    ({ collectionType, type, infoItem }) => {
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
    },
  );
}

const LIBRARY_COLLECTION_KINDS = [
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
