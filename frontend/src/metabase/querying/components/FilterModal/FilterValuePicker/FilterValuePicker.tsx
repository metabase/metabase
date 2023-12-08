import { Box, Popover } from "metabase/ui";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";
import { ColumnValuesWidget } from "metabase/common/components/ColumnValuesWidget";
import type { ColumnValuesWidgetProps } from "metabase/common/components/ColumnValuesWidget";

export function FilterValuePicker<T extends string | number>({
  value,
  column,
  onChange,
  ...props
}: ColumnValuesWidgetProps<T>) {
  return (
    <ColumnValuesWidget
      {...props}
      value={value}
      column={column}
      layoutRenderer={ColumnValuesWidgetLayout}
      expand={false}
      disableList
      hasMultipleValues
      onChange={onChange}
    />
  );
}

// https://v6.mantine.dev/core/modal/?t=props
const MODAL_Z_INDEX = 200;

export function ColumnValuesWidgetLayout({
  isFocused,
  valuesList,
  optionsList,
  onClose,
}: LayoutRendererArgs) {
  return (
    <Popover
      opened={isFocused && !!optionsList}
      position="bottom-start"
      zIndex={MODAL_Z_INDEX + 1}
      onClose={onClose}
    >
      <Popover.Target>{valuesList}</Popover.Target>
      <Popover.Dropdown>
        <Box mah="200px">{optionsList}</Box>
      </Popover.Dropdown>
    </Popover>
  );
}
