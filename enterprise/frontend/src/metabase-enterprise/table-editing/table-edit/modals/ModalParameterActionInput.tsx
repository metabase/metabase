import { t } from "ttag";

import {
  ParameterActionInput,
  type ParameterActionInputProps,
} from "../../inputs/ParameterActionInput";

import S from "./ModalParameterActionInput.module.css";

export function ModalParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  const placeholder = parameter.database_default
    ? t`Auto populated`
    : parameter.optional
      ? t`Optional`
      : undefined;

  const disabled = parameter.readonly;

  const inputProps = {
    ...rest.inputProps,
    placeholder,
    disabled,
    "data-testid": `${parameter.display_name}-field-input`,
  };

  return (
    <ParameterActionInput
      {...rest}
      inputProps={inputProps}
      parameter={parameter}
      classNames={{
        textInputElement: S.textInputElement,
        numberInputElement: S.numberInputElement,
        selectTextInputElement: S.selectTextInputElement,
        dateTextInputElement: S.dateTextInputElement,
      }}
    />
  );
}
