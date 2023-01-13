import React, { ChangeEvent, useCallback } from "react";
import { t } from "ttag";
import InputBlurChange from "metabase/components/InputBlurChange";
import Radio from "metabase/core/components/Radio";
import {
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { getIsMultiSelect } from "../../utils/dashboards";
import {
  canUseCustomSource,
  isSingleOrMultiSelectable,
} from "../../utils/parameter-type";
import ValuesSourceSettings from "../ValuesSourceSettings";
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

export interface ParameterSettingsProps {
  parameter: UiParameter;
  onChangeName: (name: string) => void;
  onChangeDefaultValue: (value: unknown) => void;
  onChangeIsMultiSelect: (isMultiSelect: boolean) => void;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceOptions: ValuesSourceConfig) => void;
  onRemoveParameter: () => void;
}

const ParameterSettings = ({
  parameter,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeName(event.target.value);
    },
    [onChangeName],
  );

  return (
    <SettingsRoot>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <InputBlurChange
          value={parameter.name}
          onBlurChange={handleNameChange}
        />
      </SettingSection>
      {canUseCustomSource(parameter) && (
        <SettingSection>
          <SettingLabel>{t`How should users filter on this column?`}</SettingLabel>
          <ValuesSourceSettings
            parameter={parameter}
            onChangeQueryType={onChangeQueryType}
            onChangeSourceType={onChangeSourceType}
            onChangeSourceConfig={onChangeSourceConfig}
          />
        </SettingSection>
      )}
      <SettingSection>
        <SettingLabel>{t`Default value`}</SettingLabel>
        <SettingValueWidget
          parameter={parameter}
          name={parameter.name}
          value={parameter.default}
          placeholder={t`No default`}
          setValue={onChangeDefaultValue}
        />
      </SettingSection>
      {isSingleOrMultiSelectable(parameter) && (
        <SettingSection>
          <SettingLabel>{t`Users can pick`}</SettingLabel>
          <Radio
            value={getIsMultiSelect(parameter)}
            options={MULTI_SELECT_OPTIONS}
            vertical
            onChange={onChangeIsMultiSelect}
          />
        </SettingSection>
      )}
      <SettingRemoveButton onClick={onRemoveParameter}>
        {t`Remove`}
      </SettingRemoveButton>
    </SettingsRoot>
  );
};

export default ParameterSettings;
