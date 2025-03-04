import CS from "metabase/css/core/index.css";

import { ColorRange } from "../ColorRange";

import { ToggleButton, ToggleRoot } from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
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
}: ColorRangeToggleProps) => {
  return (
    <ToggleRoot>
      <ColorRange
        bd="1px solid red"
        colors={value}
        isQuantile={isQuantile}
        onSelect={onColorRangeSelect}
        aria-label={getColorRangeLabel(value)}
        flex="1 1 auto"
        className={onColorRangeSelect ? CS.cursorPointer : CS.cursorDefault}
      />
      {showToggleButton && (
        <ToggleButton icon="compare" small onClick={onToggleClick} />
      )}
    </ToggleRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorRangeToggle;

export function getColorRangeLabel(value: string[]) {
  return value.join("-");
}
