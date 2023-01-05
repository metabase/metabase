import React, { ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";
import InputBlurChange from "metabase/components/InputBlurChange";
import Modal from "metabase/components/Modal";
import SelectButton from "metabase/core/components/SelectButton";
import Radio from "metabase/core/components/Radio";
import { UiParameter } from "metabase-lib/parameters/types";
import { getIsMultiSelect } from "../../utils/dashboards";
import {
  canUseCustomSource,
  isSingleOrMultiSelectable,
} from "../../utils/parameter-type";
import ValuesSourceModal from "../ValuesSourceModal";
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
  onRemoveParameter: () => void;
}

const ParameterSettings = ({
  parameter,
  onChangeName,
  onChangeDefaultValue,
  onChangeIsMultiSelect,
  onRemoveParameter,
}: ParameterSettingsProps): JSX.Element => {
  const [isOpened, setIsOpened] = useState(false);

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeName(event.target.value);
    },
    [onChangeName],
  );

  const handleModalOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsOpened(false);
  }, []);

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
          <SettingLabel>{t`Options to pick from`}</SettingLabel>
          <SelectButton onClick={handleModalOpen}>
            {getSourceTypeName(parameter)}
          </SelectButton>
          {isOpened && (
            <Modal medium onClose={handleModalClose}>
              <ValuesSourceModal
                parameter={parameter}
                onClose={handleModalClose}
              />
            </Modal>
          )}
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

const getSourceTypeName = (parameter: UiParameter) => {
  switch (parameter.values_source_type) {
    case "static-list":
      return t`Custom list`;
    default:
      return t`From this field`;
  }
};

export default ParameterSettings;
