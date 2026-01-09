import CS from "metabase/css/core/index.css";
import { ActionIcon, Flex, type FlexProps, Icon } from "metabase/ui";

import { ColorRange } from "../ColorRange";

export interface ColorRangeToggleProps extends FlexProps {
  value: string[];
  isQuantile?: boolean;
  onToggleClick?: () => void;
  onColorRangeSelect?: (newColorRange: string[]) => void;
  showToggleButton?: boolean;
}

const ColorRangeToggle = ({
  value,
  isQuantile,
  onToggleClick,
  onColorRangeSelect,
  showToggleButton = false,
  ...flexProps
}: ColorRangeToggleProps) => (
  <Flex gap="sm" {...flexProps}>
    <ColorRange
      colors={value}
      isQuantile={isQuantile}
      onSelect={onColorRangeSelect}
      aria-label={getColorRangeLabel(value)}
      flex="1 1 auto"
      className={onColorRangeSelect ? CS.cursorPointer : CS.cursorDefault}
    />
    {showToggleButton && (
      <ActionIcon
        onClick={onToggleClick}
        variant="outline"
        color="border"
        p="sm"
        size="lg"
      >
        <Icon c="text-secondary" name="compare" />
      </ActionIcon>
    )}
  </Flex>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorRangeToggle;

export function getColorRangeLabel(value: string[]) {
  return value.join("-");
}
