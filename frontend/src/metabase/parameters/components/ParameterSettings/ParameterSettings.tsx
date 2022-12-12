import React, { FocusEvent, useCallback } from "react";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { Parameter } from "metabase-types/api";
import { SettingLabel, SettingSection } from "./ParameterSettings.styled";

interface ParameterSettingsProps {
  parameter: Parameter;
  onChangeName: (name: string) => void;
}

const ParameterSettings = ({
  parameter,
  onChangeName,
}: ParameterSettingsProps): JSX.Element => {
  const handleNameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onChangeName(event.target.value);
    },
    [onChangeName],
  );

  return (
    <div>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <Input value={parameter.name} fullWidth onBlur={handleNameBlur} />
      </SettingSection>
    </div>
  );
};

export default ParameterSettings;
