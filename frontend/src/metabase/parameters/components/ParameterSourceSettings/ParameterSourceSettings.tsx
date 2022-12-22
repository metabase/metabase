import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import Modal from "metabase/components/Modal";
import {
  getSourceConfig,
  getSourceType,
} from "metabase/parameters/utils/dashboards";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ValuesCardSourceModal from "../ValuesCardSourceModal";
import ValuesListSourceModal from "../ValuesListSourceModal";
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
  const sourceType = getSourceType(parameter);
  const sourceConfig = getSourceConfig(parameter);
  const [editingType, setEditingType] = useState<ValuesSourceType>();

  const radioOptions = useMemo(
    () => getRadioOptions(sourceType, setEditingType),
    [sourceType],
  );

  const handleSourceTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      if (sourceType == null) {
        onChangeSourceType(sourceType);
        onChangeSourceConfig({});
      } else {
        setEditingType(sourceType);
      }
    },
    [onChangeSourceType, onChangeSourceConfig],
  );

  const handleSourceConfigChange = useCallback(
    (sourceConfig: ValuesSourceConfig) => {
      if (editingType) {
        onChangeSourceType(editingType);
        onChangeSourceConfig(sourceConfig);
      }
    },
    [editingType, onChangeSourceType, onChangeSourceConfig],
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
          <ValuesCardSourceModal
            sourceConfig={sourceConfig}
            onChangeSourceConfig={handleSourceConfigChange}
            onClose={handleClose}
          />
        </Modal>
      )}
      {editingType === "static-list" && (
        <Modal onClose={handleClose}>
          <ValuesListSourceModal
            sourceConfig={sourceConfig}
            onChangeSourceConfig={handleSourceConfigChange}
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
  sourceType: ValuesSourceType,
  onEdit: (sourceType: ValuesSourceType) => void,
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
