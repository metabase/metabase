import React, { ChangeEvent, useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import Radio from "metabase/core/components/Radio/Radio";
import ModalContent from "metabase/components/ModalContent";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import {
  ModalLabel,
  ModalLayout,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./SourceTypeModal.styled";

const NEW_LINE = "\n";

const SOURCE_TYPE_OPTIONS = [
  { name: t`From this field`, value: null },
  { name: t`Custom list`, value: "static-list" },
];

interface SourceTypeModalProps {
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  fieldValues: string[][];
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onClose: () => void;
}

const SourceTypeModal = ({
  sourceType,
  sourceConfig,
  fieldValues,
  onChangeSourceType,
  onChangeSourceConfig,
  onClose,
}: SourceTypeModalProps): JSX.Element => {
  const handleTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      onChangeSourceType(sourceType);
      onChangeSourceConfig(getDefaultSourceConfig(sourceType, fieldValues));
    },
    [fieldValues, onChangeSourceType, onChangeSourceConfig],
  );

  const handleValuesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChangeSourceConfig({ values: getValues(event.target.value) });
    },
    [onChangeSourceConfig],
  );

  return (
    <ModalContent
      title={t`Selectable values`}
      footer={[
        <Button
          key="submit"
          primary
          disabled={!isValidSourceConfig(sourceType, sourceConfig)}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalLayout>
        <ModalPane>
          <ModalSection>
            <ModalLabel>{t`Where values should come from`}</ModalLabel>
            <Radio
              value={sourceType}
              options={SOURCE_TYPE_OPTIONS}
              vertical
              onChange={handleTypeChange}
            />
          </ModalSection>
        </ModalPane>
        <ModalMain>
          {sourceType === null && (
            <ModalTextArea
              defaultValue={getValuesText(fieldValues)}
              readOnly
              fullWidth
            />
          )}
          {sourceType === "static-list" && (
            <ModalTextArea
              defaultValue={getValuesText(sourceConfig.values)}
              fullWidth
              onChange={handleValuesChange}
            />
          )}
        </ModalMain>
      </ModalLayout>
    </ModalContent>
  );
};

const getValues = (value: string) => {
  return value
    .split(NEW_LINE)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => [line]);
};

const getValuesText = (values?: string[][]) => {
  return values?.map(([key]) => key).join(NEW_LINE) ?? "";
};

const isValidSourceConfig = (
  sourceType: ValuesSourceType,
  sourceConfig: ValuesSourceConfig,
) => {
  switch (sourceType) {
    case "static-list":
      return sourceConfig.values != null && sourceConfig.values.length > 0;
    default:
      return true;
  }
};

const getDefaultSourceConfig = (
  sourceType: ValuesSourceType,
  fieldValues: string[][],
) => {
  switch (sourceType) {
    case "static-list":
      return { values: fieldValues };
    default:
      return {};
  }
};

export default SourceTypeModal;
