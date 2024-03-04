import { useMemo } from "react";
import { t } from "ttag";

import { StackedCheckBox } from "metabase/components/StackedCheckBox";
import CheckBox from "metabase/core/components/CheckBox";
import * as Lib from "metabase-lib";

import { ToggleItem, ColumnItem } from "./FieldPicker.styled";

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  "data-testid"?: string;
  isColumnSelected: (
    column: Lib.ColumnMetadata,
    columnInfo: Lib.ColumnDisplayInfo,
  ) => boolean;
  onToggle: (
    column: Lib.ColumnMetadata,
    isSelected: boolean,
    columnIndex: number,
  ) => void;
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
    <ul data-testid={props["data-testid"]}>
      <ToggleItem>
        <StackedCheckBox
          className=""
          label={isAll ? t`Select none` : t`Select all`}
          checked={isAll}
          indeterminate={!isAll && !isNone}
          onChange={handleLabelToggle}
        />
      </ToggleItem>
      {items.map((item, index) => (
        <ColumnItem key={item.columnInfo.longDisplayName}>
          <CheckBox
            checked={item.isSelected}
            disabled={item.isSelected && isDisabledDeselection}
            onChange={event =>
              onToggle(item.column, event.target.checked, index)
            }
          />
        </ColumnItem>
      ))}
    </ul>
  );
};
