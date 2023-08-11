import { useMemo } from "react";
import { t } from "ttag";
import CheckBox from "metabase/core/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import * as Lib from "metabase-lib";
import { ToggleItem, ColumnItem } from "./FieldPicker.styled";

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  "data-testid"?: string;
  isColumnSelected: (column: Lib.ColumnMetadata) => boolean;
  onToggle: (columnIndex: number, isSelected: boolean) => void;
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
      columns.map(column => ({
        ...Lib.displayInfo(query, stageIndex, column),
        column,
      })),
    [query, stageIndex, columns],
  );

  const isAll = useMemo(
    () => columns.every(isColumnSelected),
    [columns, isColumnSelected],
  );

  const isNone = useMemo(
    () => columns.every(column => !isColumnSelected(column)),
    [columns, isColumnSelected],
  );

  const isDisabledDeselection = useMemo(
    () => columns.filter(isColumnSelected).length <= 1,
    [columns, isColumnSelected],
  );

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
        <ColumnItem key={item.longDisplayName}>
          <CheckBox
            checked={isColumnSelected(item.column)}
            label={item.displayName}
            disabled={isColumnSelected(item.column) && isDisabledDeselection}
            onChange={event => onToggle(index, event.target.checked)}
          />
        </ColumnItem>
      ))}
    </ul>
  );
};
