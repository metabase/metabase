import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import {
  getSourceOptions,
  getSourceType,
} from "metabase/parameters/utils/dashboards";
import {
  ParameterSourceOptions,
  ParameterSourceType,
} from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterCardSourceModal from "../ParameterCardSourceModal";
import ParameterListSourceModal from "../ParameterListSourceModal";
import {
  RadioLabelButton,
  RadioLabelRoot,
  RadioLabelTitle,
} from "./ParameterSourceSettings.styled";

export interface ParameterSourceSettingsProps {
  parameter: UiParameter;
  onChangeSourceType: (sourceType: ParameterSourceType) => void;
  onChangeSourceOptions: (sourceOptions: ParameterSourceOptions) => void;
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
      if (sourceType == null) {
        onChangeSourceType(sourceType);
        onChangeSourceOptions({});
      } else {
        setEditingType(sourceType);
      }
    },
    [onChangeSourceType, onChangeSourceOptions],
  );

  const handleSourceOptionsChange = useCallback(
    (sourceOptions: ParameterSourceOptions) => {
      if (editingType) {
        onChangeSourceType(editingType);
        onChangeSourceOptions(sourceOptions);
      }
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
      {editingType === "card" && (
        <Modal medium onClose={handleClose}>
          <ParameterCardSourceModal
            parameter={parameter}
            onChangeSourceOptions={handleSourceOptionsChange}
            onClose={handleClose}
          />
        </Modal>
      )}
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
          title={t`Values from a model or question`}
          isSelected={sourceType === "card"}
          onEditClick={() => onEdit("card")}
        />
      ),
      value: "card",
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
