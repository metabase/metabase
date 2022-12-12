import React, { FocusEvent, useCallback } from "react";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import { Parameter } from "metabase-types/api";
import { getIsMultiSelect } from "../../utils/dashboards";
import { isSingleOrMultiSelectable } from "../../utils/parameter-type";
import {
  SettingLabel,
  SettingSection,
  SettingsRoot,
  SettingValueWidget,
} from "./ParameterSettings.styled";

const MULTI_SELECT_OPTIONS = [
  { name: t`Multiple values`, value: true },
  { name: t`A single value`, value: false },
];

interface ParameterSettingsProps {
  parameter: Parameter;
  onNameChange: (name: string) => void;
  onDefaultValueChange: (value: unknown) => void;
  onMultiSelectChange: (isMultiSelect: boolean) => void;
}

const ParameterSettings = ({
  parameter,
  onNameChange,
  onDefaultValueChange,
  onMultiSelectChange,
}: ParameterSettingsProps): JSX.Element => {
  const handleNameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onNameChange(event.target.value);
    },
    [onNameChange],
  );

  return (
    <SettingsRoot>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <Input value={parameter.name} fullWidth onBlur={handleNameBlur} />
      </SettingSection>
      <SettingSection>
        <SettingLabel>{t`Default value`}</SettingLabel>
        <SettingValueWidget
          parameter={parameter}
          name={parameter.name}
          value={parameter.default}
          placeholder={t`No default`}
          setValue={onDefaultValueChange}
        />
      </SettingSection>
      {isSingleOrMultiSelectable(parameter) && (
        <SettingSection>
          <SettingLabel>{t`Users can pick`}</SettingLabel>
          <Radio
            value={getIsMultiSelect(parameter)}
            options={MULTI_SELECT_OPTIONS}
            vertical
            onChange={onMultiSelectChange}
          />
        </SettingSection>
      )}
    </SettingsRoot>
  );
};

export default ParameterSettings;
