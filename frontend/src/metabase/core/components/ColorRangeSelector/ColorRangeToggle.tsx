import React, { useCallback, useMemo, useState } from "react";
import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  onChange?: (value: string[]) => void;
}

const ColorRangeToggle = ({ value, onChange }: ColorRangeToggleProps) => {
  const [isInverted, setIsInverted] = useState(false);

  const displayValue = useMemo(() => {
    return isInverted ? value.reverse() : value;
  }, [value, isInverted]);

  const handleRangeClick = useCallback(() => {
    onChange?.(displayValue);
  }, [displayValue, onChange]);

  const handleButtonClick = useCallback(() => {
    setIsInverted(isInverted => !isInverted);
  }, []);

  return (
    <ToggleRoot>
      <ToggleColorRange colors={displayValue} onClick={handleRangeClick} />
      <ToggleButton icon="compare" onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
