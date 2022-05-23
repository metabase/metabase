import React from "react";
import ColorPill from "metabase/core/components/ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorSelectorContent from "./ColorSelectorContent";

export interface ColorSelectorProps {
  color: string;
  colors: string[];
  isBordered?: boolean;
  isSelected?: boolean;
  onChange?: (color: string) => void;
}

const ColorSelector = ({
  color,
  colors,
  isBordered,
  isSelected,
  onChange,
}: ColorSelectorProps): JSX.Element => {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorPill
          color={color}
          isBordered={isBordered}
          isSelected={isSelected}
          onClick={onClick}
        />
      )}
      popoverContent={
        <ColorSelectorContent
          color={color}
          colors={colors}
          onChange={onChange}
        />
      }
    />
  );
};

export default ColorSelector;
