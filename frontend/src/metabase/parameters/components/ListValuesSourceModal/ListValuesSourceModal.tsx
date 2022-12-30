import React, { ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import { ValuesSourceConfig } from "metabase-types/api";
import { ModalMessage, ModalTextArea } from "./ListValuesSourceModal.styled";

const NEW_LINE = "\n";
const PLACEHOLDER = [t`banana`, t`orange`].join(NEW_LINE);

export interface ListValuesSourceModalProps {
  sourceConfig: ValuesSourceConfig;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onClose: () => void;
}

const ListValuesSourceModal = ({
  sourceConfig,
  onChangeSourceConfig,
  onClose,
}: ListValuesSourceModalProps): JSX.Element => {
  const [value, setValue] = useState(getInputValue(sourceConfig.values));
  const isEmpty = !value.trim().length;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    onChangeSourceConfig({ values: getSourceValues(value) });
    onClose();
  }, [value, onChangeSourceConfig, onClose]);

  return (
    <ModalContent
      title={t`Create a custom list`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="submit"
          primary
          disabled={isEmpty}
          onClick={handleSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <div>
        <ModalMessage>{t`Enter one value per line.`}</ModalMessage>
        <ModalTextArea
          value={value}
          placeholder={PLACEHOLDER}
          autoFocus
          fullWidth
          onChange={handleChange}
        />
      </div>
    </ModalContent>
  );
};

const getInputValue = (values?: string[]) => {
  return values?.join(NEW_LINE) ?? "";
};

const getSourceValues = (value: string) => {
  return value
    .split(NEW_LINE)
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

export default ListValuesSourceModal;
