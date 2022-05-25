import React, { useState } from "react";
import { ColorSetting } from "./types";
import BrandColorSection from "../BrandColorSection";
import { originalColors } from "../../lib/whitelabel";

export interface ColorSchemeWidgetProps {
  setting: ColorSetting;
  onChange?: (colors: Record<string, string>) => void;
}

const ColorSchemeWidget = ({
  setting,
}: ColorSchemeWidgetProps): JSX.Element => {
  const [colors, setColors] = useState(setting.value ?? {});

  return (
    <div>
      <BrandColorSection
        colors={colors}
        originalColors={originalColors}
        onChange={setColors}
      />
    </div>
  );
};

export default ColorSchemeWidget;
