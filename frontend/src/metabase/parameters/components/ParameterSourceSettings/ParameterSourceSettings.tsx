import React, { MouseEvent, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import { getSourceType } from "metabase/parameters/utils/dashboards";
import { ParameterSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterListSourceModal from "../ParameterListSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ParameterSourceSettings.styled";

export interface ParameterSourceSettingsProps {
  parameter: UiParameter;
  onChangeSourceType: (
    parameterId: string,
    sourceType: ParameterSourceType,
  ) => void;
}

const ParameterSourceSettings = ({
  parameter,
  onChangeSourceType,
}: ParameterSourceSettingsProps): JSX.Element => {
  const parameterId = parameter.id;
  const sourceType = getSourceType(parameter);
  const [modalType, setModalType] = useState<ParameterSourceType>();

  const radioOptions = useMemo(
    () => getRadioOptions(sourceType, setModalType),
    [sourceType],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ParameterSourceType) => {
      onChangeSourceType(parameterId, sourceType);
    },
    [parameterId, onChangeSourceType],
  );

  const handleClose = useCallback(() => {
    setModalType(undefined);
  }, []);

  return (
    <>
      <Radio
        value={sourceType}
        options={radioOptions}
        vertical
        onChange={handleSourceTypeChange}
      />
      {modalType === "static-list" && (
        <Modal onClose={handleClose}>
          <ParameterListSourceModal
            parameter={parameter}
            onClose={handleClose}
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
  const handleEditClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      onEditClick?.();
    },
    [onEditClick],
  );

  return (
    <RadioLabelRoot>
      <RadioLabelTitle>{title}</RadioLabelTitle>
      {isSelected && onEditClick && (
        <RadioLabelButton onClick={handleEditClick}>{t`Edit`}</RadioLabelButton>
      )}
    </RadioLabelRoot>
  );
};

const getRadioOptions = (
  sourceType: ParameterSourceType,
  onModalOpen: (sourceType: ParameterSourceType) => void,
) => {
  return [
    {
      name: (
        <RadioLabel
          title={t`Values from column`}
          isSelected={sourceType === "field"}
        />
      ),
      value: "field",
    },
    {
      name: (
        <RadioLabel
          title={t`Custom list`}
          isSelected={sourceType === "static-list"}
          onEditClick={() => onModalOpen("static-list")}
        />
      ),
      value: "static-list",
    },
  ];
};

export default ParameterSourceSettings;
