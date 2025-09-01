import { t } from "ttag";

import { Combobox, Icon } from "metabase/ui";
import { TableActionFormInputType } from "metabase-enterprise/table-editing/api/types";

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

  let wrapperClassName = S.inputWrapper;
  let hideControls;

  switch (parameter.input_type) {
    case TableActionFormInputType.Text:
      wrapperClassName = S.inputWrapperText;
      break;

    case TableActionFormInputType.Integer:
      hideControls = false;
      wrapperClassName = S.inputWrapperNumber;
      break;

    case TableActionFormInputType.Float:
      wrapperClassName = S.inputWrapperNumber;
      break;

    case TableActionFormInputType.Date:
    case TableActionFormInputType.DateTime:
      wrapperClassName = S.inputWrapperDate;
      inputProps.leftSection = <Icon name="calendar" />;
      inputProps.leftSectionPointerEvents = "none";
      break;

    case TableActionFormInputType.Boolean:
    case TableActionFormInputType.Dropdown:
      inputProps.rightSection = <Combobox.Chevron />;
      inputProps.rightSectionPointerEvents = "none";
      wrapperClassName = S.inputWrapperDropdown;
  }

  return (
    <ParameterActionInput
      {...rest}
      inputProps={inputProps}
      parameter={parameter}
      hideControls={hideControls}
      classNames={{
        wrapper: wrapperClassName,
      }}
    />
  );
}
