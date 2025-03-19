import { t } from "ttag";

import type { StartRule } from "../types";

export function getPlaceholder(startRule: StartRule) {
  if (startRule === "expression") {
    return t`Give your column a name…`;
  } else if (startRule === "aggregation") {
    return t`Give your aggregation a name…`;
  } else if (startRule === "boolean") {
    return t`Give your filter a name…`;
  }
  return t`Give your expression a name…`;
}
