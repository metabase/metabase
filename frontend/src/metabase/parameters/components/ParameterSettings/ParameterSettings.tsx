import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio";
import { slugify } from "metabase/lib/formatting";
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
  otherParameterSlugs: string[];
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
  otherParameterSlugs,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const [internalValue, setInternalValue] = useState(parameter.name);

  useLayoutEffect(() => {
    setInternalValue(parameter.name);
  }, [parameter.name]);

  const handleLabelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(event.target.value);
    },
    [],
  );

  let labelError;
  if (internalValue "") {
    labelError t`Required`;
  } else if (otherParameterSlugs.includes(slugify(internalValue))) {
    labelError t`This label is already in use`;
  }

  const handleLabelBlur = useCallback(
    (event: { target: HTMLInputElement }) => {
      if (labelError) {
        setInternalValue(parameter.name);
      } else {
        onChangeName(event.target.value);
      }
    },
    [onChangeName, parameter.name, labelError],
  );

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
          value={internalValue}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ParameterSettings;
