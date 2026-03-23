import { t } from "ttag";

import type * as Lib from "metabase-lib";

export function getPlaceholder(expressionMode: Lib.ExpressionMode) {
  if (expressionMode === "expression") {
    return t`Give your column a name…`;
  } else if (expressionMode === "aggregation") {
    return t`Give your aggregation a name…`;
  } else if (expressionMode === "filter") {
    return t`Give your filter a name…`;
  }
  return t`Give your expression a name…`;
}
