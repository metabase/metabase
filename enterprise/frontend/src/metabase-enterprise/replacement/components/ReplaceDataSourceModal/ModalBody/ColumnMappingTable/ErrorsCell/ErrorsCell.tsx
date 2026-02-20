import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { ReplaceSourceErrorType } from "metabase-types/api";

import { getErrorListLabel } from "../../../../../utils";

type ErrorsCellProps = {
  errors: ReplaceSourceErrorType[];
};

export function ErrorsCell({ errors }: ErrorsCellProps) {
  return <Ellipsified>{getErrorListLabel(errors)}</Ellipsified>;
}
