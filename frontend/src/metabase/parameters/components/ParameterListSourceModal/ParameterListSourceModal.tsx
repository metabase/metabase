import React, { ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { ParameterSourceOptions } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { ModalMessage, ModalTextArea } from "./ParameterListSourceModal.styled";

const NEW_LINE = "\n";
const PLACEHOLDER = [t`banana`, t`orange`].join(NEW_LINE);

export interface ParameterListSourceModalProps {
  parameter: UiParameter;
  onChangeSourceOptions: (sourceOptions: ParameterSourceOptions) => void;
  onClose?: () => void;
}

const ParameterListSourceModal = ({
  parameter,
  onChangeSourceOptions,
  onClose,
}: ParameterListSourceModalProps): JSX.Element => {
  const options = getSourceOptions(parameter);
  const [value, setValue] = useState(options.values?.join(NEW_LINE) ?? "");

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const values = value.split(NEW_LINE);
    onChangeSourceOptions({ values });
    onClose?.();
  }, [value, onChangeSourceOptions, onClose]);

  return (
    <ModalContent
      title={t`Create a custom list`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary onClick={handleSubmit}>{t`Done`}</Button>,
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

export default ParameterListSourceModal;
