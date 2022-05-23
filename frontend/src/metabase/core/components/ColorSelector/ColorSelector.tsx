import React from "react";

export interface ColorSelectorProps {
  color?: string;
  colors: string[];
  onChange: (color: string) => void;
}

const ColorSelector = (): JSX.Element => {
  return <div />;
};

export default ColorSelector;
