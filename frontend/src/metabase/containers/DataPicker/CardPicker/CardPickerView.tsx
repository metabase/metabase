import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";

import type { ITreeNodeItem } from "metabase/components/tree/types";
import type { Collection } from "metabase-types/api";
import type Table from "metabase-lib/metadata/Table";

import type { DataPickerSelectedItem, VirtualTable } from "../types";

import EmptyState from "../EmptyState";
import LoadingState from "../LoadingState";
import VirtualizedSelectList from "../VirtualizedSelectList";
import PanePicker from "../PanePicker";

import { ListContainer } from "./CardPicker.styled";

type TargetModel = "model" | "question";

interface CardPickerViewProps {
  collectionTree: ITreeNodeItem[];
  virtualTables?: VirtualTable[];
  selectedItems: DataPickerSelectedItem[];
  targetModel: TargetModel;
  isLoading: boolean;
  onSelectCollection: (id: Collection["id"]) => void;
  onSelectedVirtualTable: (id: Table["id"]) => void;
  onBack?: () => void;
}

function getTableIcon({
  isSelected,
  targetModel,
}: {
  isSelected: boolean;
  targetModel: TargetModel;
}) {
  if (isSelected) {
    return "check";
  }
  return targetModel === "model" ? "model" : "table2";
}

function TableSelectListItem({
  table,
  targetModel,
  isSelected,
  onSelect,
}: {
  table: VirtualTable;
  targetModel: "model" | "question";
  isSelected: boolean;
  onSelect: (id: Table["id"]) => void;
}) {
  return (
    <VirtualizedSelectList.Item
      id={table.id}
      name={table.display_name}
      isSelected={isSelected}
      icon={getTableIcon({ isSelected, targetModel })}
      onSelect={onSelect}
    >
      {table.display_name}
    </VirtualizedSelectList.Item>
  );
}

function formatCollectionId(id: string | number | null) {
  const canonicalId = canonicalCollectionId(id);
  return canonicalId === null ? "root" : canonicalId;
}

function CardPickerView({
  collectionTree,
  virtualTables,
  selectedItems,
  targetModel,
  isLoading,
  onSelectCollection,
  onSelectedVirtualTable,
  onBack,
}: CardPickerViewProps) {
  const { selectedCollectionId, selectedVirtualTableIds } = useMemo(() => {
    const { collection: collections = [], table: tables = [] } = _.groupBy(
      selectedItems,
      "type",
    );

    const [collection] = collections;

    return {
      selectedCollectionId: collection?.id,
      selectedVirtualTableIds: tables.map(table => table.id),
    };
  }, [selectedItems]);

  const handlePanePickerSelect = useCallback(
    (item: ITreeNodeItem) => {
      onSelectCollection(formatCollectionId(item.id));
    },
    [onSelectCollection],
  );

  const renderVirtualTable = useCallback(
    ({ item: table }: { item: VirtualTable }) => (
      <TableSelectListItem
        key={table.id}
        table={table}
        targetModel={targetModel}
        isSelected={selectedVirtualTableIds.includes(table.id)}
        onSelect={onSelectedVirtualTable}
      />
    ),
    [selectedVirtualTableIds, targetModel, onSelectedVirtualTable],
  );

  const isEmpty = _.isEmpty(virtualTables);

  return (
    <PanePicker
      data={collectionTree}
      selectedId={selectedCollectionId}
      onSelect={handlePanePickerSelect}
      onBack={onBack}
    >
      {isLoading ? (
        <LoadingState />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <ListContainer>
          {Array.isArray(virtualTables) && (
            <VirtualizedSelectList<VirtualTable>
              items={virtualTables}
              renderItem={renderVirtualTable}
            />
          )}
        </ListContainer>
      )}
    </PanePicker>
  );
}

export default CardPickerView;
