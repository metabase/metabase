import { t } from "ttag";

import {
  ParameterActionInput,
  type ParameterActionInputProps,
} from "../../inputs/ParameterActionInput";

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
    />
  );
}
