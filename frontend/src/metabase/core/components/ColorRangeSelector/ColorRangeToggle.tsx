import React, { useCallback, useMemo, useState } from "react";
import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  isQuantile?: boolean;
  onChange?: (newValue: string[]) => void;
}

const ColorRangeToggle = ({
  value,
  isQuantile,
  onChange,
}: ColorRangeToggleProps) => {
  const [isInverted, setIsInverted] = useState(false);

  const displayValue = useMemo(() => {
    return isInverted ? Array.from(value).reverse() : value;
  }, [value, isInverted]);

  const handleButtonClick = useCallback(() => {
    setIsInverted(isInverted => !isInverted);
  }, []);

  return (
    <ToggleRoot>
      <ToggleColorRange
        colors={displayValue}
        isQuantile={isQuantile}
        onSelect={onChange}
      />
      <ToggleButton icon="compare" small onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
