import React, { MouseEvent, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Radio from "metabase/core/components/Radio/Radio";
import { getSourceType } from "metabase/parameters/utils/dashboards";
import { ParameterSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import ParameterListSourceModal from "../ParameterListSourceModal";
import {
  RadioLabelLink,
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

  const options = useMemo(
    () => [
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
            onEditClick={() => setModalType("static-list")}
          />
        ),
        value: "static-list",
      },
    ],
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
        options={options}
        vertical
        onChange={handleSourceTypeChange}
      />
      {modalType === "static-list" && (
        <ParameterListSourceModal parameter={parameter} onClose={handleClose} />
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
        <RadioLabelLink onClick={handleEditClick}>{t`Edit`}</RadioLabelLink>
      )}
    </RadioLabelRoot>
  );
};

export default ParameterSourceSettings;
