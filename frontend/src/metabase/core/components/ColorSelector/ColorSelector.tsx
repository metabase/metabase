import React from "react";
import ColorPill from "../ColorPill";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { ColorGrid } from "./ColorSelector.styled";

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
        <ColorGrid>
          {colors.map((option, index) => (
            <ColorPill
              key={index}
              color={option}
              isBordered
              isSelected={color === option}
              onClick={() => onChange(option)}
            />
          ))}
        </ColorGrid>
      }
    />
  );
};

export default ColorSelector;
