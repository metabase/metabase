import React from "react";
import ColorPill from "../ColorPill";
import { ColorSelectorRoot } from "./ColorSelector.styled";

export interface ColorSelectorProps {
  color?: string;
  colors: string[];
  onChange: (color: string) => void;
}

const ColorSelector = ({
  color,
  colors,
  onChange,
}: ColorSelectorProps): JSX.Element => {
  return (
    <ColorSelectorRoot>
      {colors.map((option, index) => (
        <ColorPill
          key={index}
          color={option}
          isBordered
          isSelected={color === option}
          onClick={() => onChange(option)}
        />
      ))}
    </ColorSelectorRoot>
  );
};

export default ColorSelector;
