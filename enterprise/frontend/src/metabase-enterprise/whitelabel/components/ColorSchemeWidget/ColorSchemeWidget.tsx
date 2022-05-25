import React, { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import { debounce } from "lodash";
import BrandColorSection from "../BrandColorSection";
import {
  SettingRoot,
  SettingSection,
  SettingTitle,
} from "./ColorSchemeWidget.styled";

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
  const onChangeDebounced = useDebounce(onChange);

  const handleChange = useCallback(
    (colors: Record<string, string>) => {
      setColors(colors);
      onChangeDebounced?.(colors);
    },
    [onChangeDebounced],
  );

  return (
    <SettingRoot>
      <SettingSection>
        <SettingTitle>{t`User interface colors`}</SettingTitle>
        <BrandColorSection
          colors={colors}
          originalColors={originalColors}
          onChange={handleChange}
        />
      </SettingSection>
      <SettingSection>
        <SettingTitle>{t`Chart colors`}</SettingTitle>
      </SettingSection>
    </SettingRoot>
  );
};

const useDebounce = (onChange?: (colors: Record<string, string>) => void) => {
  const ref = useRef(onChange);
  ref.current = onChange;

  const callback = useCallback((colors: Record<string, string>) => {
    return ref.current?.(colors);
  }, []);

  return useMemo(() => {
    return debounce(callback, DEBOUNCE_TIMEOUT);
  }, [callback]);
};

export default ColorSchemeWidget;
