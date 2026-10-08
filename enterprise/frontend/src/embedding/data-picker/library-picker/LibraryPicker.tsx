import { useCallback, useMemo, useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { buildCollectionTree } from "metabase/common/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { Box, Icon } from "metabase/ui";
import type {
  CollectionId,
  DatabaseId,
  LibraryCollection,
  TableId,
} from "metabase-types/api";

import SavedEntityPickerS from "../saved-entity-picker/SavedEntityPicker.module.css";

import { LibraryItemList } from "./LibraryItemList";

interface LibraryPickerProps {
  libraryCollection: LibraryCollection;
  canSelectTable: boolean;
  canSelectModel: boolean;
  canSelectMetric: boolean;
  databaseId?: DatabaseId | null;
  selectedTableId?: TableId;
  onSelect: (tableId: TableId) => void;
  onBack: () => void;
}

export function LibraryPicker({
  libraryCollection,
  canSelectTable,
  canSelectModel,
  canSelectMetric,
  databaseId,
  selectedTableId,
  onSelect,
  onBack,
}: LibraryPickerProps) {
  const { data: collections } = useListCollectionsTreeQuery({
    "exclude-archived": true,
  });
  const [selectedCollectionId, setSelectedCollectionId] =
    useState<CollectionId>(libraryCollection.id);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const libraryNode = collections?.find(
      (collection) => collection.id === libraryCollection.id,
    );
    return buildCollectionTree(libraryNode ? [libraryNode] : []);
  }, [collections, libraryCollection.id]);

  const handleSelect = useCallback((collection: ITreeNodeItem) => {
    setSelectedCollectionId(collection.id);
  }, []);

  return (
    <Box className={SavedEntityPickerS.SavedEntityPickerRoot}>
      <Box className={SavedEntityPickerS.CollectionsContainer}>
        <a
          className={SavedEntityPickerS.BackButton}
          onClick={onBack}
          data-testid="library-picker-back-navigation"
        >
          <Icon name="chevronleft" className={CS.mr1} />
          {libraryCollection.name}
        </a>
        <Box m="0.5rem 0" data-testid="library-picker-collection-tree">
          <Tree
            data={collectionTree}
            onSelect={handleSelect}
            selectedId={selectedCollectionId}
          />
        </Box>
      </Box>
      <LibraryItemList
        collectionId={selectedCollectionId}
        canSelectTable={canSelectTable}
        canSelectModel={canSelectModel}
        canSelectMetric={canSelectMetric}
        databaseId={databaseId}
        selectedTableId={selectedTableId}
        onSelect={onSelect}
      />
    </Box>
  );
}
