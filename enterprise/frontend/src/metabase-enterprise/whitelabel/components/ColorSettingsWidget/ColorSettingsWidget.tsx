import React from "react";
import { originalColors } from "../../lib/whitelabel";
import ColorSettings from "../ColorSettings";
import { ColorSetting } from "./types";

export interface ColorSettingsWidget {
  setting: ColorSetting;
  onChange: (value: Record<string, string>) => void;
}

const ColorSettingsWidget = ({ setting }: ColorSettingsWidget): JSX.Element => {
  return (
    <ColorSettings
      initialColors={setting.value}
      originalColors={originalColors}
    />
  );
};

export default ColorSettingsWidget;
