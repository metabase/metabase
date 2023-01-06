import React, { ChangeEvent, useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import Radio from "metabase/core/components/Radio/Radio";
import ModalContent from "metabase/components/ModalContent";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import {
  getDefaultSourceConfig,
  isValidSourceConfig,
} from "metabase-lib/parameters/utils/parameter-source";
import {
  ModalHelpText,
  ModalLabel,
  ModalLayout,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./ValuesSourceTypeModal.styled";

const NEW_LINE = "\n";

const SOURCE_TYPE_OPTIONS = [
  { name: t`From this field`, value: null },
  { name: t`Custom list`, value: "static-list" },
];

interface ValuesSourceTypeModalProps {
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  fieldValues: string[][];
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ValuesSourceTypeModal = ({
  sourceType,
  sourceConfig,
  fieldValues,
  onChangeSourceType,
  onChangeSourceConfig,
  onSubmit,
  onClose,
}: ValuesSourceTypeModalProps): JSX.Element => {
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
          onClick={onSubmit}
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
            {sourceType === "static-list" && (
              <ModalHelpText>{t`Enter one value per line.`}</ModalHelpText>
            )}
          </ModalSection>
        </ModalPane>
        <ModalMain>
          {sourceType === null && (
            <ModalTextArea
              defaultValue={getFieldsText(fieldValues)}
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
    .filter(line => line.length > 0);
};

const getValuesText = (values?: string[]) => {
  return values?.join(NEW_LINE) ?? "";
};

const getFieldsText = (values?: string[][]) => {
  return getValuesText(values?.map(([key]) => key));
};

export default ValuesSourceTypeModal;
