import { t } from "ttag";
import CheckBox from "metabase/core/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import * as Lib from "metabase-lib";
import { ToggleItem, ColumnItem } from "./FieldPicker.styled";

interface FieldPickerProps {
  items: Lib.ColumnDisplayInfo[];
  isAll: boolean;
  isNone: boolean;
  onToggle: (columnIndex: number, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export const FieldPicker = ({
  items,
  isAll,
  isNone,
  onToggle,
  onSelectAll,
  onSelectNone,
}: FieldPickerProps) => {
  const handleLabelToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  return (
    <ul>
      <ToggleItem>
        <StackedCheckBox
          className=""
          label={isAll ? t`Select none` : t`Select all`}
          checked={isAll}
          indeterminate={!isAll && !isNone}
          onChange={handleLabelToggle}
        />
      </ToggleItem>
      {items.map((displayInfo, columnIndex) => (
        <ColumnItem key={columnIndex}>
          <CheckBox
            checked={displayInfo.selected}
            label={displayInfo.displayName}
            onChange={event => onToggle(columnIndex, event.target.checked)}
          />
        </ColumnItem>
      ))}
    </ul>
  );
};
