import { HexColorPicker } from "react-colorful";

import { ControlsRoot } from "./ColorPicker.styled";

export interface ColorPickerControlsProps {
  color?: string;
  onChange?: (color: string) => void;
}

function ColorPickerControls({ color, onChange }: ColorPickerControlsProps) {
  return (
    <ControlsRoot>
      <HexColorPicker color={color} onChange={onChange} />
    </ControlsRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerControls;
