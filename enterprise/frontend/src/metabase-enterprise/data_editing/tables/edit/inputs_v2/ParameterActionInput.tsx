import { t } from "ttag";

import type { ActionFormParameter } from "../../types";
import { ActionFormParameterType } from "../../types";

import { ActionInputDateTime } from "./ActionInputDateTime";
import { ActionInputText } from "./ActionInputText";
import type { ActionInputSharedProps } from "./types";

type ParameterActionInputProps = ActionInputSharedProps & {
  parameter: ActionFormParameter;
};

export function ParameterActionInput(props: ParameterActionInputProps) {
  const { parameter, ...rest } = props;

  // TOOD: add `Auto populated` label for db-generated values when BE supports it
  const placeholder = parameter.optional ? t`Optional` : undefined;
  const inputProps = {
    ...rest.inputProps,
    placeholder,
  };

  switch (parameter.type) {
    case ActionFormParameterType.Date:
      return <ActionInputDateTime {...rest} inputProps={inputProps} />;
    case ActionFormParameterType.DateTime:
      return (
        <ActionInputDateTime {...rest} inputProps={inputProps} isDateTime />
      );
    default:
      return <ActionInputText {...rest} inputProps={inputProps} />;
  }
}
