import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { debounce } from "lodash";
import BrandColorSection from "../BrandColorSection";
import { SectionTitle } from "./ColorSchemeWidget.styled";

const DEBOUNCE_TIMEOUT = 400;

export interface ColorSchemeWidgetProps {
  initialColors?: Record<string, string>;
  originalColors?: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const ColorSchemeWidget = ({
  initialColors = {},
  originalColors = {},
  onChange,
}: ColorSchemeWidgetProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors);

  const onChangeDebounced = useMemo(() => {
    return onChange && debounce(onChange, DEBOUNCE_TIMEOUT);
  }, [onChange]);

  const handleChange = useCallback(
    (colors: Record<string, string>) => {
      setColors(colors);
      onChangeDebounced?.(colors);
    },
    [onChangeDebounced],
  );

  return (
    <div>
      <SectionTitle>{t`User interface colors`}</SectionTitle>
      <BrandColorSection
        colors={colors}
        originalColors={originalColors}
        onChange={handleChange}
      />
    </div>
  );
};

export default ColorSchemeWidget;
