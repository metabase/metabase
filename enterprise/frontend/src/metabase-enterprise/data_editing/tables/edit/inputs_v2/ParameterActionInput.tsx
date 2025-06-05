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

  switch (parameter.type) {
    case ActionFormParameterType.Date:
      return <ActionInputDateTime {...rest} />;
    case ActionFormParameterType.DateTime:
      return <ActionInputDateTime {...rest} isDateTime />;
    default:
      return <ActionInputText {...rest} />;
  }
}
