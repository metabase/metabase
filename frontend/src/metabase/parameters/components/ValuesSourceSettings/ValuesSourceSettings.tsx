import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import {
  Parameter,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { getQueryType } from "metabase-lib/parameters/utils/parameter-source";
import ValuesSourceModal from "../ValuesSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ValuesSourceSettings.styled";

export interface ValuesSourceSettingsProps {
  parameter: Parameter;
  onChangeQueryType: (queryType: ValuesQueryType) => void;
  onChangeSourceSettings: (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => void;
}

const ValuesSourceSettings = ({
  parameter,
  onChangeQueryType,
  onChangeSourceSettings,
}: ValuesSourceSettingsProps): JSX.Element => {
  const queryType = getQueryType(parameter);
  const [isModalOpened, setIsModalOpened] = useState(false);

  const radioOptions = useMemo(() => {
    return getRadioOptions(queryType, () => setIsModalOpened(true));
  }, [queryType]);

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
            onSubmit={onChangeSourceSettings}
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
      name: (
        <RadioLabel
          title={t`Search box`}
          isSelected={queryType === "search"}
          onEditClick={onEditClick}
        />
      ),
      value: "search",
    },
    {
      name: <RadioLabel title={t`Input box`} />,
      value: "none",
    },
  ];
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ValuesSourceSettings;
