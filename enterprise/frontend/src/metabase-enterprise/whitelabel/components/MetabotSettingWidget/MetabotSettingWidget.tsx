import React from "react";
import { t } from "ttag";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Toggle from "metabase/core/components/Toggle";
import {
  MetabotSettingWidgetRoot,
  MetabotContainer,
  ToggleContainer,
  ToggleLabel,
} from "./MetabotSettingWidget.styled";

const MetabotSettingWidget = ({ setting, onChange }: any) => {
  const isEnabled = setting.value ?? setting.defaultValue;
  const metabotImage = isEnabled ? "metabot-happy" : "metabot-sad";

  const toggleId = useUniqueId("show-metabot-switch");
  return (
    <MetabotSettingWidgetRoot>
      <MetabotContainer>
        <img
          src={`app/assets/img/${metabotImage}.gif`}
          width="94px"
          alt="Metabot"
        />
      </MetabotContainer>
      <ToggleContainer>
        <ToggleLabel
          htmlFor={toggleId}
        >{t`Display our little friend on the homepage`}</ToggleLabel>
        <Toggle
          id={toggleId}
          aria-checked={setting.value}
          role="switch"
          value={isEnabled}
          onChange={onChange}
        />
      </ToggleContainer>
    </MetabotSettingWidgetRoot>
  );
};

export default MetabotSettingWidget;
