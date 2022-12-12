import React, {
  ChangeEvent,
  FocusEvent,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import { Parameter } from "metabase-types/api";
import { getIsMultiSelect } from "../../utils/dashboards";
import { isSingleOrMultiSelectable } from "../../utils/parameter-type";
import {
  SettingLabel,
  SettingRemoveButton,
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
  onRemove: () => void;
}

const ParameterSettings = ({
  parameter,
  onNameChange,
  onDefaultValueChange,
  onMultiSelectChange,
  onRemove,
}: ParameterSettingsProps): JSX.Element => {
  return (
    <SettingsRoot>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <ParameterInput initialValue={parameter.name} onChange={onNameChange} />
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
      <SettingRemoveButton onClick={onRemove}>{t`Remove`}</SettingRemoveButton>
    </SettingsRoot>
  );
};

interface ParameterInputProps {
  initialValue: string;
  onChange: (value: string) => void;
}

const ParameterInput = ({ initialValue, onChange }: ParameterInputProps) => {
  const [value, setValue] = useState(initialValue);

  useLayoutEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  return (
    <Input
      value={value}
      fullWidth
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

export default ParameterSettings;
