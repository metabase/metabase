import React, { ChangeEvent, useCallback, useMemo } from "react";
import { FontSelect } from "./FontFamilySettings.styled";

export interface FontFamilySettingsProps {
  font: string | null;
  availableFonts: string[];
  onChange: (fontFamily: string | null) => void;
}

const FontFamilySettings = ({
  font,
  availableFonts,
  onChange,
}: FontFamilySettingsProps): JSX.Element => {
  const options = useMemo(
    () => availableFonts.map(font => ({ name: font, value: font })),
    [availableFonts],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange(event.currentTarget.value);
    },
    [onChange],
  );

  return <FontSelect value={font} options={options} onChange={handleChange} />;
};

export default FontFamilySettings;
