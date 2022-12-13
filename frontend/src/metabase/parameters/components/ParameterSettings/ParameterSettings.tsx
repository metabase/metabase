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
import { getIsMultiSelect, setParameterName } from "../../utils/dashboards";
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
  onChangeParameter: (parameter: Parameter) => void;
  onRemoveParameter: (parameterId: string) => void;
}

const ParameterSettings = ({
  parameter,
  onChangeParameter,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const handleNameChange = useCallback(
    (name: string) => {
      onChangeParameter(setParameterName(parameter, name));
    },
    [parameter, onChangeParameter],
  );

  const handleDefaultValueChange = useCallback(
    (value: unknown) => {
      onChangeParameter({ ...parameter, default: value });
    },
    [parameter, onChangeParameter],
  );

  const handleMultiSelectChange = useCallback(
    (isMultiSelect: boolean) => {
      onChangeParameter({ ...parameter, isMultiSelect });
    },
    [parameter, onChangeParameter],
  );

  const handleRemove = useCallback(() => {
    onRemoveParameter(parameter.id);
  }, [parameter, onRemoveParameter]);

  return (
    <SettingsRoot>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <ParameterInput
          initialValue={parameter.name}
          onChange={handleNameChange}
        />
      </SettingSection>
      <SettingSection>
        <SettingLabel>{t`Default value`}</SettingLabel>
        <SettingValueWidget
          parameter={parameter}
          name={parameter.name}
          value={parameter.default}
          placeholder={t`No default`}
          setValue={handleDefaultValueChange}
        />
      </SettingSection>
      {isSingleOrMultiSelectable(parameter) && (
        <SettingSection>
          <SettingLabel>{t`Users can pick`}</SettingLabel>
          <Radio
            value={getIsMultiSelect(parameter)}
            options={MULTI_SELECT_OPTIONS}
            vertical
            onChange={handleMultiSelectChange}
          />
        </SettingSection>
      )}
      <SettingRemoveButton onClick={handleRemove}>
        {t`Remove`}
      </SettingRemoveButton>
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
