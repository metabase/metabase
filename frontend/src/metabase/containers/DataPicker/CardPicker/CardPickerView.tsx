import { useCallback, useMemo } from "react";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";
import SelectList from "metabase/components/SelectList";
import type { ITreeNodeItem } from "metabase/components/tree/types";
import type Table from "metabase-lib/v1/metadata/Table";
import type { CollectionId, TableId } from "metabase-types/api";

import EmptyState from "../EmptyState";
import LoadingState from "../LoadingState";
import PanePicker from "../PanePicker";
import type { DataPickerSelectedItem } from "../types";

import { StyledSelectList } from "./CardPicker.styled";

type TargetModel = "model" | "question";

interface CardPickerViewProps {
  collectionTree: ITreeNodeItem[];
  virtualTables?: Table[];
  selectedItems: DataPickerSelectedItem[];
  targetModel: TargetModel;
  isLoading: boolean;
  onSelectCollection: (id: CollectionId) => void;
  onSelectedVirtualTable: (id: TableId) => void;
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
  table: Table;
  targetModel: "model" | "question";
  isSelected: boolean;
  onSelect: (id: Table["id"]) => void;
}) {
  return (
    <SelectList.Item
      id={table.id}
      name={table.display_name}
      isSelected={isSelected}
      icon={getTableIcon({ isSelected, targetModel })}
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
    (table: Table) => (
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
        <StyledSelectList>
          {virtualTables?.map?.(renderVirtualTable)}
        </StyledSelectList>
      )}
    </PanePicker>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CardPickerView;
