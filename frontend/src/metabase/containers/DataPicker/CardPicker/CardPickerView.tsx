import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import SelectList from "metabase/components/SelectList";

import { canonicalCollectionId } from "metabase/collections/utils";

import type { ITreeNodeItem } from "metabase/components/tree/types";
import type { Collection } from "metabase-types/api";
import type Table from "metabase-lib/lib/metadata/Table";

import type { DataPickerSelectedItem, VirtualTable } from "../types";
import PanePicker from "../PanePicker";

import { StyledSelectList } from "./CardPicker.styled";

interface CardPickerViewProps {
  collectionTree: ITreeNodeItem[];
  virtualTables?: VirtualTable[];
  selectedItems: DataPickerSelectedItem[];
  targetModel: "model" | "question";
  onSelectCollection: (id: Collection["id"]) => void;
  onSelectedVirtualTable: (id: Table["id"]) => void;
  onBack?: () => void;
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
  const icon = useMemo(() => {
    if (isSelected) {
      return "check";
    }
    return targetModel === "model" ? "model" : "table2";
  }, [isSelected, targetModel]);

  return (
    <SelectList.Item
      id={table.id}
      name={table.display_name}
      isSelected={isSelected}
      icon={icon}
      onSelect={onSelect}
    >
      {table.display_name}
    </SelectList.Item>
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
  onSelectCollection,
  onSelectedVirtualTable,
  onBack,
}: CardPickerViewProps) {
  const { selectedCollectionId, selectedVirtualTableIds } = useMemo(() => {
    const { schema: collections = [], table: tables = [] } = _.groupBy(
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
    (table: VirtualTable) => (
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

  return (
    <PanePicker
      data={collectionTree}
      selectedId={selectedCollectionId}
      onSelect={handlePanePickerSelect}
      onBack={onBack}
    >
      <StyledSelectList>
        {virtualTables?.map?.(renderVirtualTable)}
      </StyledSelectList>
    </PanePicker>
  );
}

export default CardPickerView;
