import React from "react";
import { t } from "ttag";
import FontFileSettings from "../FontFileSettings";
import {
  FontFileSection,
  SettingDescription,
  SettingRoot,
} from "./FontSettings.styled";

const FontSettings = (): JSX.Element => {
  return (
    <SettingRoot>
      <FontFileSection>
        <SettingDescription>
          {t`Tell us where to find the font file for each required style.`}
        </SettingDescription>
        <FontFileSettings files={[]} onChange={() => 0} />
      </FontFileSection>
    </SettingRoot>
  );
};

export default FontSettings;
