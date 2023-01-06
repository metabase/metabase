import React, { ChangeEvent, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Radio from "metabase/core/components/Radio/Radio";
import Select, { Option } from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import ModalContent from "metabase/components/ModalContent";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
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
  { name: t`From another model or question`, value: "card" },
  { name: t`Custom list`, value: "static-list" },
];

interface ValuesSourceTypeModalProps {
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  table?: Table;
  fieldValues: string[][];
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onChangeCard: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

const ValuesSourceTypeModal = ({
  sourceType,
  sourceConfig,
  table,
  fieldValues,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeCard,
  onSubmit,
  onClose,
}: ValuesSourceTypeModalProps): JSX.Element => {
  const fields = useMemo(() => {
    return table && getSupportedFields(table);
  }, [table]);

  const selectedField = useMemo(() => {
    return fields && getFieldByReference(fields, sourceConfig?.valueField);
  }, [fields, sourceConfig]);

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
          {sourceType === "card" && (
            <ModalSection>
              <ModalLabel>{t`Model or question to supply the values`}</ModalLabel>
              <SelectButton onClick={onChangeCard}>
                {table ? table.displayName() : t`Pick a model or question…`}
              </SelectButton>
            </ModalSection>
          )}
          {table && (
            <ModalSection>
              <ModalLabel>{t`Column to supply the values`}</ModalLabel>
              <Select value={selectedField} placeholder={t`Pick a column…`}>
                {fields?.map((field, index) => (
                  <Option
                    key={index}
                    name={field.displayName()}
                    value={field}
                  />
                ))}
              </Select>
            </ModalSection>
          )}
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

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

const getFieldByReference = (fields: Field[], reference?: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), reference));
};

export default ValuesSourceTypeModal;
