import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import ModalContent from "metabase/components/ModalContent";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import {
  ModalLabel,
  ModalLayout,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./ValuesSourceModal.styled";

const NEW_LINE = "\n";

const TYPE_OPTIONS = [
  { name: t`From this field`, value: null },
  { name: t`Custom list`, value: "static-list" },
];

interface ValuesSourceModalProps {
  parameter: UiParameter;
  fieldValues?: string[];
  onFetchFieldValues?: (parameter: UiParameter) => void;
  onSubmit?: (type: ValuesSourceType, config: ValuesSourceConfig) => void;
  onClose?: () => void;
}

const ValuesSourceModal = ({
  parameter,
  fieldValues = [],
  onFetchFieldValues,
  onSubmit,
  onClose,
}: ValuesSourceModalProps): JSX.Element => {
  const [type, setType] = useState(parameter.values_source_type ?? null);
  const [config, setConfig] = useState(parameter.values_source_config ?? {});

  const handleTypeChange = useCallback((type: ValuesSourceType) => {
    setType(type);
    setConfig({});
  }, []);

  const handleValuesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setConfig({ values: getValues(event.target.value) });
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    onSubmit?.(type, config);
    onClose?.();
  }, [type, config, onSubmit, onClose]);

  useEffect(() => {
    onFetchFieldValues?.(parameter);
  }, [parameter, onFetchFieldValues]);

  return (
    <ModalContent
      title={t`Selectable values for ${parameter.name}`}
      footer={[
        <Button
          key="submit"
          primary
          disabled={!canSubmit(type, config)}
          onClick={handleSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalLayout>
        <ModalPane>
          <ModalSection>
            <ModalLabel>{t`Where values should come from`}</ModalLabel>
            <Radio
              value={type}
              options={TYPE_OPTIONS}
              vertical
              onChange={handleTypeChange}
            />
          </ModalSection>
        </ModalPane>
        <ModalMain>
          {type === null && (
            <ModalTextArea
              defaultValue={getValuesText(fieldValues)}
              readOnly
              fullWidth
            />
          )}
          {type === "static-list" && (
            <ModalTextArea
              defaultValue={getValuesText(config.values)}
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

const canSubmit = (type: ValuesSourceType, config: ValuesSourceConfig) => {
  switch (type) {
    case "static-list":
      return config.values != null && config.values.length > 0;
    default:
      return true;
  }
};

export default ValuesSourceModal;
