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
import { ParameterSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { getIsMultiSelect, getSourceType } from "../../utils/dashboards";
import { isSingleOrMultiSelectable } from "../../utils/parameter-type";
import {
  SettingLabel,
  SettingRemoveButton,
  SettingSection,
  SettingsRoot,
  SettingValueWidget,
} from "./ParameterSettings.styled";

const SOURCE_TYPE_OPTIONS = [
  { name: t`Values from column`, value: "field" },
  { name: t`Custom list`, value: "custom-list" },
];

const MULTI_SELECT_OPTIONS = [
  { name: t`Multiple values`, value: true },
  { name: t`A single value`, value: false },
];

interface ParameterSettingsProps {
  parameter: UiParameter;
  onChangeName: (parameterId: string, name: string) => void;
  onChangeDefaultValue: (parameterId: string, value: unknown) => void;
  onChangeIsMultiSelect: (parameterId: string, isMultiSelect: boolean) => void;
  onChangeSourceType: (
    parameterId: string,
    sourceType: ParameterSourceType,
  ) => void;
  onRemoveParameter: (parameterId: string) => void;
}

const ParameterSettings = ({
  parameter,
  onChangeName,
  onChangeSourceType,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const parameterId = parameter.id;

  const handleNameChange = useCallback(
    (name: string) => {
      onChangeName(parameterId, name);
    },
    [parameterId, onChangeName],
  );

  const handleDefaultValueChange = useCallback(
    (value: unknown) => {
      onChangeDefaultValue(parameterId, value);
    },
    [parameterId, onChangeDefaultValue],
  );

  const handleMultiSelectChange = useCallback(
    (isMultiSelect: boolean) => {
      onChangeIsMultiSelect(parameterId, isMultiSelect);
    },
    [parameterId, onChangeIsMultiSelect],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ParameterSourceType) => {
      onChangeSourceType(parameterId, sourceType);
    },
    [parameterId, onChangeSourceType],
  );

  const handleRemove = useCallback(() => {
    onRemoveParameter(parameterId);
  }, [parameterId, onRemoveParameter]);

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
        <SettingLabel>{t`Options to pick from`}</SettingLabel>
        <Radio
          value={getSourceType(parameter)}
          options={SOURCE_TYPE_OPTIONS}
          vertical
          onChange={handleSourceTypeChange}
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
