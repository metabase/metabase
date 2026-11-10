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

interface LibraryPickerProps {
  libraryCollection: LibraryCollection;
  canSelectMetric: boolean;
  databaseId?: DatabaseId | null;
  selectedSource?: DataSource;
  /**
   * The collection of a reopened published table. The picker opens on Data or
   * Metrics, whichever lists it, and `SavedEntityPicker` starts on it with the
   * table selected.
   */
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

  if (!collections) {
    return null;
  }

  const libraryNode = findCollectionById(collections, libraryCollection.id);
  const collectionKinds = getLibraryCollectionKinds(
    libraryNode?.children ?? [],
    { canSelectMetric },
  );

  return (
    <LibraryCollectionKindPicker
      libraryCollection={libraryCollection}
      collectionKinds={collectionKinds}
      databaseId={databaseId}
      selectedSource={selectedSource}
      collectionId={collectionId}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
}

type CollectionKind = ReturnType<typeof getLibraryCollectionKinds>[number];

interface LibraryCollectionKindPickerProps extends Omit<
  LibraryPickerProps,
  "canSelectMetric"
> {
  collectionKinds: CollectionKind[];
}

function LibraryCollectionKindPicker({
  libraryCollection,
  collectionKinds,
  databaseId,
  selectedSource,
  collectionId,
  onSelect,
  onBack,
}: LibraryCollectionKindPickerProps) {
  // `null` shows the Data and Metrics choice
  const [openCollectionKindId, setOpenCollectionKindId] = useState(() =>
    getInitialCollectionKindId(collectionKinds, collectionId),
  );
  const openCollectionKind = collectionKinds.find(
    (collectionKind) => collectionKind.infoItem.id === openCollectionKindId,
  );

  if (openCollectionKind) {
    return (
      <SavedEntityPicker
        type={openCollectionKind.type}
        libraryCollections={openCollectionKind.collections}
        selectedSource={selectedSource}
        collectionId={collectionId}
        databaseId={databaseId}
        onSelect={onSelect}
        onBack={
          collectionKinds.length === 1
            ? onBack
            : () => setOpenCollectionKindId(null)
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
          onChangeDataBucket={setOpenCollectionKindId}
        />
      </Box>
    </Box>
  );
}

// The only one offered opens straight away; otherwise the one listing a
// reopened table's collection opens, or the choice shows
function getInitialCollectionKindId(
  collectionKinds: CollectionKind[],
  collectionId: CollectionId | null | undefined,
) {
  if (collectionKinds.length === 1) {
    return collectionKinds[0].infoItem.id;
  }
  const collectionKind = collectionKinds.find(
    (collectionKind) =>
      collectionId != null &&
      findCollectionById(collectionKind.collections, collectionId),
  );
  return collectionKind?.infoItem.id ?? null;
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
