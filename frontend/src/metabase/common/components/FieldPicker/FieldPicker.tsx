import { useMemo } from "react";
import { t } from "ttag";
import CheckBox from "metabase/core/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import * as Lib from "metabase-lib";

interface FieldPickerProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  canDeselect?: boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export const FieldPicker = ({
  query,
  stageIndex,
  columns,
  canDeselect = true,
  onToggle,
  onSelectAll,
  onSelectNone,
}: FieldPickerProps) => {
  const items = useMemo(
    () =>
      columns.map(column => ({
        column,
        displayInfo: Lib.displayInfo(query, stageIndex, column),
      })),
    [query, stageIndex, columns],
  );

  const isAll = useMemo(
    () => items.every(({ displayInfo }) => displayInfo.selected),
    [items],
  );

  const isNone = useMemo(
    () => items.every(({ displayInfo }) => !displayInfo.selected),
    [items],
  );

  return (
    <ul>
      <li>
        <StackedCheckBox
          className=""
          label={isAll ? t`Select none` : t`Select all`}
          checked={isAll}
          indeterminate={!isAll && !isNone}
          onChange={() => {
            if (isAll) {
              onSelectNone();
            } else {
              onSelectAll();
            }
          }}
        />
      </li>
      {items.map(({ column, displayInfo }, index) => (
        <li key={index}>
          <CheckBox
            checked={displayInfo.selected}
            disabled={displayInfo.selected && !canDeselect}
            label={displayInfo.displayName}
            onChange={event => onToggle(column, event.target.checked)}
          />
        </li>
      ))}
    </ul>
  );
};
