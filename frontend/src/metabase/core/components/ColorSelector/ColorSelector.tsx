import React from "react";
import ColorPill from "../ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { ColorSelectorContent } from "./ColorSelector.styled";

export interface ColorSelectorProps {
  color: string;
  colors: string[];
  onChange: (color: string) => void;
}

const ColorSelector = ({
  color,
  colors,
  onChange,
}: ColorSelectorProps): JSX.Element => {
  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <ColorPill color={color} isBordered isSelected onClick={onClick} />
      )}
      popoverContent={
        <ColorSelectorContent colors={colors}>
          {colors.map((option, index) => (
            <ColorPill
              key={index}
              color={option}
              isBordered
              isSelected={color === option}
              onClick={() => onChange(option)}
            />
          ))}
        </ColorSelectorContent>
      }
    />
  );
};

export default ColorSelector;
