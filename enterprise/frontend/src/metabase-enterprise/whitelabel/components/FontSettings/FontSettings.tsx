import React from "react";
import { t } from "ttag";
import { FontFile } from "metabase-types/api";
import FontFileSettings from "../FontFileSettings";
import {
  FontFileSection,
  SettingDescription,
  SettingRoot,
} from "./FontSettings.styled";

export interface FontSettingsProps {
  fontFamily: string | null;
  fontFiles: FontFile[];
  onChangeFontFamily: (fontFamily: string | null) => void;
  onChangeFontFiles: (fontFiles: FontFile[]) => void;
}

const FontSettings = ({
  fontFamily,
  fontFiles,
  onChangeFontFamily,
  onChangeFontFiles,
}: FontSettingsProps): JSX.Element => {
  return (
    <SettingRoot>
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
