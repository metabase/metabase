import React, { useCallback, useMemo, useState } from "react";
import {
  ToggleButton,
  ToggleColorRange,
  ToggleRoot,
} from "./ColorRangeToggle.styled";

export interface ColorRangeToggleProps {
  value: string[];
  quantile?: boolean;
  onChange?: (newValue: string[]) => void;
}

const ColorRangeToggle = ({
  value,
  quantile,
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
        quantile={quantile}
        onSelect={onChange}
      />
      <ToggleButton icon="compare" small onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
