import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import {
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { getQueryType } from "metabase-lib/parameters/utils/parameter-source";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesSourceModal from "../ValuesSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ValuesSourceSettings.styled";

export interface ValuesSourceSettingsProps {
  parameter: UiParameter;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const ValuesSourceSettings = ({
  parameter,
  onChangeQueryType,
  onChangeSourceType,
  onChangeSourceConfig,
}: ValuesSourceSettingsProps): JSX.Element => {
  const queryType = getQueryType(parameter);
  const [isModalOpened, setIsModalOpened] = useState(false);

  const radioOptions = useMemo(() => {
    return getRadioOptions(queryType, () => setIsModalOpened(true));
  }, [queryType]);

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
      <Radio
        value={queryType}
        options={radioOptions}
        vertical
        onChange={onChangeQueryType}
      />
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
  isSelected?: boolean;
  onEditClick?: () => void;
}

const RadioLabel = ({
  title,
  isSelected,
  onEditClick,
}: RadioLabelProps): JSX.Element => {
  return (
    <RadioLabelRoot>
      <RadioLabelTitle>{title}</RadioLabelTitle>
      {isSelected && (
        <RadioLabelButton onClick={onEditClick}>{t`Edit`}</RadioLabelButton>
      )}
    </RadioLabelRoot>
  );
};

const getRadioOptions = (
  queryType: ValuesQueryType,
  onEditClick: () => void,
) => {
  return [
    {
      name: (
        <RadioLabel
          title={t`Dropdown list`}
          isSelected={queryType === "list"}
          onEditClick={onEditClick}
        />
      ),
      value: "list",
    },
    {
      name: <RadioLabel title={t`Search box`} />,
      value: "search",
    },
    {
      name: <RadioLabel title={t`Input box`} />,
      value: "none",
    },
  ];
};

export default ValuesSourceSettings;
