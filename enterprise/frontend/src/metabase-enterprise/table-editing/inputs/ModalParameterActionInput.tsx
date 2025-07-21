import { t } from "ttag";

import {
  ParameterActionInput,
  type ParameterActionInputProps,
} from "./ParameterActionInput";

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
  };

  return (
    <ParameterActionInput
      {...rest}
      inputProps={inputProps}
      parameter={parameter}
    />
  );
}
