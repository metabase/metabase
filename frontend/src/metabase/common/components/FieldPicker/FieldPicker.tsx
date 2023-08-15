import { t } from "ttag";
import CheckBox from "metabase/core/components/CheckBox";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import * as Lib from "metabase-lib";
import { ToggleItem, ColumnItem } from "./FieldPicker.styled";

interface FieldPickerProps {
  columnsInfo: Lib.ColumnDisplayInfo[];
  isAll: boolean;
  isNone: boolean;
  isDisabledDeselection?: boolean;
  onToggle: (columnIndex: number, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export const FieldPicker = ({
  columnsInfo,
  isAll,
  isNone,
  isDisabledDeselection,
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
      {columnsInfo.map((columnInfo, columnIndex) => (
        <ColumnItem key={columnIndex}>
          <CheckBox
            checked={columnInfo.selected}
            label={columnInfo.displayName}
            disabled={columnInfo.selected && isDisabledDeselection}
            onChange={event => onToggle(columnIndex, event.target.checked)}
          />
        </ColumnItem>
      ))}
    </ul>
  );
};
