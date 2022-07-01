import React from "react";
import { t } from "ttag";
import { FontFile } from "metabase-types/api";
import FontFamilySettings from "../FontFamilySettings";
import FontFileSettings from "../FontFileSettings";
import {
  FontFileSection,
  SettingDescription,
  SettingRoot,
} from "./FontSettings.styled";

export interface FontSettingsProps {
  font: string | null;
  fontFiles: FontFile[];
  availableFonts: string[];
  onChangeFont: (fontFamily: string | null) => void;
  onChangeFontFiles: (fontFiles: FontFile[]) => void;
}

const FontSettings = ({
  font,
  fontFiles,
  availableFonts,
  onChangeFont,
  onChangeFontFiles,
}: FontSettingsProps): JSX.Element => {
  return (
    <SettingRoot>
      <FontFamilySettings
        font={font}
        availableFonts={availableFonts}
        onChange={onChangeFont}
      />
      <FontFileSection>
        <SettingDescription>
          {t`Tell us where to find the font file for each required style.`}
        </SettingDescription>
        <FontFileSettings fontFiles={fontFiles} onChange={onChangeFontFiles} />
      </FontFileSection>
    </SettingRoot>
  );
};

export default FontSettings;
