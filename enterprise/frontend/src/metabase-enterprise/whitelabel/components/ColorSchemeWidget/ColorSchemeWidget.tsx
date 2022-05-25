import React, { useState } from "react";
import { t } from "ttag";
import BrandColorSection from "../BrandColorSection";
import { SectionTitle } from "./ColorSchemeWidget.styled";

export interface ColorSchemeWidgetProps {
  initialColors?: Record<string, string>;
  originalColors?: Record<string, string>;
}

const ColorSchemeWidget = ({
  initialColors = {},
  originalColors = {},
}: ColorSchemeWidgetProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors);

  return (
    <div>
      <SectionTitle>{t`User interface colors`}</SectionTitle>
      <BrandColorSection
        colors={colors}
        originalColors={originalColors}
        onChange={setColors}
      />
    </div>
  );
};

export default ColorSchemeWidget;
