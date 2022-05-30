import React, { useCallback } from "react";
import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  isInverted?: boolean;
  isQuantile?: boolean;
  onSelect?: (newValue: string[]) => void;
  onToggle?: (isInverted: boolean) => void;
}

const ColorRangeToggle = ({
  value,
  isInverted,
  isQuantile,
  onSelect,
  onToggle,
}: ColorRangeToggleProps) => {
  const handleButtonClick = useCallback(() => {
    onToggle?.(!isInverted);
  }, [isInverted, onToggle]);

  return (
    <ToggleRoot>
      <ToggleColorRange
        colors={value}
        isQuantile={isQuantile}
        onSelect={onSelect}
      />
      <ToggleButton icon="compare" small onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
