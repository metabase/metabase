import { useMemo } from "react";
import { t } from "ttag";
import { Checkbox, DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FieldInfoIcon } from "metabase/components/MetadataInfo/FieldInfoIcon";
import {
  ToggleItem,
  ColumnItem,
  ItemTitle,
  ItemIcon,
} from "./FieldPicker.styled";

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
        <label>
          <Checkbox
            variant="stacked"
            checked={isAll}
            indeterminate={!isAll && !isNone}
            onChange={handleLabelToggle}
          />
          <ItemTitle>{isAll ? t`Select none` : t`Select all`}</ItemTitle>
        </label>
      </ToggleItem>
      <DelayGroup>
        {items.map((item, index) => (
          <ColumnItem key={item.longDisplayName}>
            <label>
              <Checkbox
                checked={isColumnSelected(item.column)}
                disabled={
                  isColumnSelected(item.column) && isDisabledDeselection
                }
                onChange={event => onToggle(index, event.target.checked)}
              />

              <ItemIcon name={getColumnIcon(item.column)} size={18} />
              <ItemTitle>{item.displayName}</ItemTitle>
              <FieldInfoIcon
                query={query}
                stageIndex={stageIndex}
                column={item.column}
                position="right"
              />
            </label>
          </ColumnItem>
        ))}
      </DelayGroup>
    </ul>
  );
};
