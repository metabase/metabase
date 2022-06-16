import React from "react";
import { t } from "ttag";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import MetabotLogo from "metabase/components/MetabotLogo";
import {
  MetabotSettingWidgetRoot,
  MetabotContainer,
  ToggleContainer,
  ToggleLabel,
} from "./MetabotSettingWidget.styled";
import Toggle from "metabase/core/components/Toggle";

const MetabotSettingWidget = ({ setting, onChange }: any) => {
  const toggleId = useUniqueId("show-metabot-switch");
  return (
    <MetabotSettingWidgetRoot>
      <MetabotContainer>
        <MetabotLogo />
      </MetabotContainer>
      <ToggleContainer>
        <ToggleLabel
          htmlFor={toggleId}
        >{t`Display our little friend on the homepage`}</ToggleLabel>
        <Toggle
          id={toggleId}
          aria-checked={setting.value}
          role="switch"
          value={setting.value ?? setting.defaultValue}
          onChange={onChange}
        />
      </ToggleContainer>
    </MetabotSettingWidgetRoot>
  );
};

export default MetabotSettingWidget;
