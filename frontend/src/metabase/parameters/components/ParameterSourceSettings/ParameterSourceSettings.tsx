import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesSourceModal from "../ValuesSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ParameterSourceSettings.styled";

export interface ParameterSourceSettingsProps {
  parameter: UiParameter;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const ParameterSourceSettings = ({
  parameter,
  onChangeSourceType,
  onChangeSourceConfig,
}: ParameterSourceSettingsProps): JSX.Element => {
  const [isModalOpened, setIsModalOpened] = useState(false);

  const radioOptions = useMemo(() => {
    return getRadioOptions(() => setIsModalOpened(true));
  }, []);

  const handleSubmit = useCallback(
    (sourceType: ValuesSourceType, sourceConfig: ValuesSourceConfig) => {
      onChangeSourceType(sourceType);
      onChangeSourceConfig(sourceConfig);
    },
    [onChangeSourceType, onChangeSourceConfig],
  );

  const handleModalClose = useCallback(() => {
    setIsModalOpened(false);
  }, []);

  return (
    <>
      <Radio value="list" options={radioOptions} vertical />
      {isModalOpened && (
        <Modal medium onClose={handleModalClose}>
          <ValuesSourceModal
            parameter={parameter}
            onSubmit={handleSubmit}
            onClose={handleModalClose}
          />
        </Modal>
      )}
    </>
  );
};

interface RadioLabelProps {
  title: string;
  onEditClick: () => void;
}

const RadioLabel = ({ title, onEditClick }: RadioLabelProps): JSX.Element => {
  return (
    <RadioLabelRoot>
      <RadioLabelTitle>{title}</RadioLabelTitle>
      <RadioLabelButton onClick={onEditClick}>{t`Edit`}</RadioLabelButton>
    </RadioLabelRoot>
  );
};

const getRadioOptions = (onEditClick: () => void) => {
  return [
    {
      name: <RadioLabel title={t`Dropdown list`} onEditClick={onEditClick} />,
      value: "list",
    },
  ];
};

export default ParameterSourceSettings;
