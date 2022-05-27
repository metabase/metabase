import React, { useCallback, useMemo, useState } from "react";
import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  onChange?: (newValue: string[]) => void;
}

const ColorRangeToggle = ({ value, onChange }: ColorRangeToggleProps) => {
  const [isInverted, setIsInverted] = useState(false);

  const displayValue = useMemo(() => {
    return isInverted ? Array.from(value).reverse() : value;
  }, [value, isInverted]);

  const handleButtonClick = useCallback(() => {
    setIsInverted(isInverted => !isInverted);
  }, []);

  return (
    <ToggleRoot>
      <ToggleColorRange colors={displayValue} onSelect={onChange} />
      <ToggleButton icon="compare" onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
