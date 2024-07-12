import { useMemo } from "react";
import { t } from "ttag";

import { Checkbox, DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  ToggleItem,
  ItemList,
  Label,
  ItemTitle,
  ItemIcon,
} from "./FieldPicker.styled";

export interface FieldPickerItem {
  column: Lib.ColumnMetadata;
  columnInfo: Lib.ColumnDisplayInfo;
}

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  "data-testid"?: string;
  isColumnSelected: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  isColumnDisabled?: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export const FieldPicker = ({
  query,
  stageIndex,
  columns,
  onToggle,
  onSelectAll,
  onSelectNone,
  isColumnSelected,
  isColumnDisabled,
  ...props
}: FieldPickerProps) => {
  const items = useMemo(() => {
    const items = columns.map(column => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));
    return items.map(item => ({
      ...item,
      isSelected: isColumnSelected(item, items),
      isDisabled: isColumnDisabled?.(item, items),
    }));
  }, [query, stageIndex, columns, isColumnSelected, isColumnDisabled]);

  const isAll = items.every(item => item.isSelected);
  const isNone = items.every(item => !item.isSelected);

  const handleLabelToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  return (
    <ItemList data-testid={props["data-testid"]}>
      <ToggleItem>
        <Label as="label">
          <Checkbox
            variant="stacked"
            checked={isAll}
            indeterminate={!isAll && !isNone}
            onChange={handleLabelToggle}
          />
          <ItemTitle>{isAll ? t`Select none` : t`Select all`}</ItemTitle>
        </Label>
      </ToggleItem>
      <DelayGroup>
        {items.map(item => (
          <li key={item.columnInfo.longDisplayName}>
            <Label as="label">
              <Checkbox
                checked={item.isSelected}
                disabled={item.isDisabled}
                onChange={event => onToggle(item.column, event.target.checked)}
              />
              <ItemIcon
                query={query}
                stageIndex={stageIndex}
                column={item.column}
                position="top-start"
                size={18}
              />
              <ItemTitle>{item.columnInfo.displayName}</ItemTitle>
            </Label>
          </li>
        ))}
      </DelayGroup>
    </ItemList>
  );
};
