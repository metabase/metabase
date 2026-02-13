import { Text } from "metabase/ui";
import type { ReplaceSourceErrorType } from "metabase-types/api";

import { getErrorGroupDescription } from "../../../../utils";

type ErrorDescriptionProps = {
  errorType: ReplaceSourceErrorType;
};

export function ErrorDescription({ errorType }: ErrorDescriptionProps) {
  return <Text c="text-secondary">{getErrorGroupDescription(errorType)}</Text>;
}
