import React from "react";
import { ColorPillContent, ColorPillRoot } from "./ColorPill.styled";

export interface ColorPillProps {
  color?: string;
  isBordered?: boolean;
  isSelected?: boolean;
  isGenerated?: boolean;
}

const ColorPill = ({
  color,
  isBordered,
  isSelected,
  isGenerated,
}: ColorPillProps): JSX.Element => {
  return (
    <ColorPillRoot
      isBordered={isBordered}
      isSelected={isSelected}
      isGenerated={isGenerated}
    >
      <ColorPillContent
        isBordered={isBordered}
        style={{ backgroundColor: color }}
      />
    </ColorPillRoot>
  );
};

export default ColorPill;
