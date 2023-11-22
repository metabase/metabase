import { Box, Popover } from "metabase/ui";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";

// https://v6.mantine.dev/core/modal/?t=props
const MODAL_Z_INDEX = 200;

// Achieves a layout similar to <FieldValuesWidget showOptionsInPopover />, but with metabase/ui Popover
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
