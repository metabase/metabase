import React, { useCallback, useMemo, useState } from "react";
import Button from "metabase/core/components/Button";
import ColorRange from "metabase/core/components/ColorRange";
import { ToggleRoot } from "./ColorRangeToggle.styled";

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
      <ColorRange colors={displayValue} onClick={handleRangeClick} />
      <Button icon="compare" onClick={handleButtonClick} />
    </ToggleRoot>
  );
};

export default ColorRangeToggle;
