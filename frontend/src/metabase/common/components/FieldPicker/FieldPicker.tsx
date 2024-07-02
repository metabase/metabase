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

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  "data-testid"?: string;
  isColumnSelected: (
    column: Lib.ColumnMetadata,
    columnInfo: Lib.ColumnDisplayInfo,
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
  ...props
}: FieldPickerProps) => {
  const items = useMemo(
    () =>
      columns.map(column => {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        return {
          column,
          columnInfo,
          isSelected: isColumnSelected(column, columnInfo),
        };
      }),
    [query, stageIndex, columns, isColumnSelected],
  );

  const isAll = items.every(item => item.isSelected);
  const isNone = items.every(item => !item.isSelected);
  const isDisabledDeselection =
    items.filter(item => item.isSelected).length <= 1;

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
                checked={isColumnSelected(item.column, item.columnInfo)}
                disabled={
                  isColumnSelected(item.column, item.columnInfo) &&
                  isDisabledDeselection
                }
                onChange={event => onToggle(item.column, event.target.checked)}
              />
              <ItemIcon
                query={query}
                stageIndex={stageIndex}
                column={item.column}
                position="top-start"
                size={16}
              />
              <ItemTitle>{item.columnInfo.displayName}</ItemTitle>
            </Label>
          </li>
        ))}
      </DelayGroup>
    </ItemList>
  );
};
