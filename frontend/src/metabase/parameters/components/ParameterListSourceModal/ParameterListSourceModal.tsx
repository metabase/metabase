import React, { ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import { getSourceOptions } from "metabase/parameters/utils/dashboards";
import { ParameterSourceOptions } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";
import { ModalMessage, ModalTextArea } from "./ParameterListSourceModal.styled";

const NEW_LINE = "\n";

export interface ParameterListSourceModalProps {
  parameter: UiParameter;
  onChangeSourceOptions: (
    parameterId: string,
    sourceOptions: ParameterSourceOptions,
  ) => void;
  onClose?: () => void;
}

const ParameterListSourceModal = ({
  parameter,
  onChangeSourceOptions,
  onClose,
}: ParameterListSourceModalProps): JSX.Element => {
  const parameterId = parameter.id;
  const { values } = getSourceOptions(parameter);
  const [text, setText] = useState(values?.join(NEW_LINE) ?? "");

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    const values = text.split(NEW_LINE);
    onChangeSourceOptions(parameterId, { values });
    onClose?.();
  }, [parameterId, text, onChangeSourceOptions, onClose]);

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
          value={text}
          autoFocus
          fullWidth
          onChange={handleChange}
        />
      </div>
    </ModalContent>
  );
};

export default ParameterListSourceModal;
