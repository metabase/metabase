import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import {
  getSourceOptions,
  getSourceType,
  hasValidSourceOptions,
} from "metabase/parameters/utils/dashboards";
import { ParameterSourceConfig, ParameterSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterListSourceModal from "../ParameterListSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ParameterSourceSettings.styled";

export interface ParameterSourceSettingsProps {
  parameter: UiParameter;
  onChangeSourceType: (sourceType: ParameterSourceType) => void;
  onChangeSourceOptions: (sourceOptions: ParameterSourceConfig) => void;
}

const ParameterSourceSettings = ({
  parameter,
  onChangeSourceType,
  onChangeSourceOptions,
}: ParameterSourceSettingsProps): JSX.Element => {
  const sourceType = getSourceType(parameter);
  const sourceOptions = getSourceOptions(parameter);
  const [editingType, setEditingType] = useState<ParameterSourceType>();

  const radioOptions = useMemo(
    () => getRadioOptions(sourceType, setEditingType),
    [sourceType],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ParameterSourceType) => {
      if (hasValidSourceOptions(sourceType, sourceOptions)) {
        onChangeSourceType(sourceType);
      } else {
        setEditingType(sourceType);
      }
    },
    [sourceOptions, onChangeSourceType],
  );

  const handleSourceOptionsChange = useCallback(
    (sourceOptions: ParameterSourceConfig) => {
      if (editingType && hasValidSourceOptions(editingType, sourceOptions)) {
        onChangeSourceType(editingType);
      } else {
        onChangeSourceType(null);
      }
      onChangeSourceOptions(sourceOptions);
    },
    [editingType, onChangeSourceType, onChangeSourceOptions],
  );

  const handleClose = useCallback(() => {
    setEditingType(undefined);
  }, []);

  return (
    <>
      <Radio
        value={sourceType}
        options={radioOptions}
        vertical
        onChange={handleSourceTypeChange}
      />
      {editingType === "static-list" && (
        <Modal onClose={handleClose}>
          <ParameterListSourceModal
            parameter={parameter}
            onChangeSourceOptions={handleSourceOptionsChange}
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
  return (
    <RadioLabelRoot>
      <RadioLabelTitle>{title}</RadioLabelTitle>
      {isSelected && onEditClick && (
        <RadioLabelButton onClick={onEditClick}>{t`Edit`}</RadioLabelButton>
      )}
    </RadioLabelRoot>
  );
};

const getRadioOptions = (
  sourceType: ParameterSourceType,
  onEdit: (sourceType: ParameterSourceType) => void,
) => {
  return [
    {
      name: (
        <RadioLabel
          title={t`Values from column`}
          isSelected={sourceType === null}
        />
      ),
      value: null,
    },
    {
      name: (
        <RadioLabel
          title={t`Custom list`}
          isSelected={sourceType === "static-list"}
          onEditClick={() => onEdit("static-list")}
        />
      ),
      value: "static-list",
    },
  ];
};

export default ParameterSourceSettings;
