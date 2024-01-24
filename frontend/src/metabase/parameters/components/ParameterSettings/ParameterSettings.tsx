import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import type {
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { TextInput } from "metabase/ui";
import { canUseCustomSource } from "metabase-lib/parameters/utils/parameter-source";
import { getIsMultiSelect } from "../../utils/dashboards";
import { isSingleOrMultiSelectable } from "../../utils/parameter-type";
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
  parameter: Parameter;
  isParameterSlugUsed: (value: string) => boolean;
  onChangeName: (name: string) => void;
  onChangeDefaultValue: (value: unknown) => void;
  onChangeIsMultiSelect: (isMultiSelect: boolean) => void;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onRemoveParameter: () => void;
}

const ParameterSettings = ({
  parameter,
  isParameterSlugUsed,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const [tempLabelValue, setTempLabelValue] = useState(parameter.name);

  useLayoutEffect(() => {
    setTempLabelValue(parameter.name);
  }, [parameter.name]);

  const labelError = getLabelError({
    labelValue: tempLabelValue,
    isParameterSlugUsed,
  });

  const handleLabelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempLabelValue(event.target.value);
  };

  const handleLabelBlur = (event: { target: HTMLInputElement }) => {
    if (labelError) {
      // revert to the value before editing
      setTempLabelValue(parameter.name);
    } else {
      onChangeName(event.target.value);
    }
  };

  const handleSourceSettingsChange = useCallback(
    (sourceType: ValuesSourceType, sourceConfig: ValuesSourceConfig) => {
      onChangeSourceType(sourceType);
      onChangeSourceConfig(sourceConfig);
    },
    [onChangeSourceType, onChangeSourceConfig],
  );

  return (
    <SettingsRoot>
      <SettingSection>
        <SettingLabel>{t`Label`}</SettingLabel>
        <TextInput
          onChange={handleLabelChange}
          value={tempLabelValue}
          onBlur={handleLabelBlur}
          error={labelError}
          aria-label={t`Label`}
        />
      </SettingSection>
      {canUseCustomSource(parameter) && (
        <SettingSection>
          <SettingLabel>{t`How should people filter on this column?`}</SettingLabel>
          <ValuesSourceSettings
            parameter={parameter}
            onChangeQueryType={onChangeQueryType}
            onChangeSourceSettings={handleSourceSettingsChange}
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
          <SettingLabel>{t`People can pick`}</SettingLabel>
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

function getLabelError({
  labelValue,
  isParameterSlugUsed,
}: {
  labelValue: string;
  isParameterSlugUsed: (value: string) => boolean;
}) {
  if (!labelValue) {
    return t`Required`;
  }
  if (isParameterSlugUsed(labelValue)) {
    return t`This label is already in use.`;
  }
  if (labelValue.toLowerCase() === "tab") {
    return t`This label is reserved for dashboard tabs.`;
  }
  return null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ParameterSettings;
