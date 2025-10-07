import { match } from "ts-pattern";
import { t } from "ttag";

import type { GraphSelection } from "../types";
import { getNodeLabel } from "../utils";

export function getHeaderLabel(selection: GraphSelection) {
  const nodeLabel = getNodeLabel(selection.node);

  return match(selection.type)
    .with("question", () => t`Questions that use ${nodeLabel}`)
    .with("model", () => t`Models that use ${nodeLabel}`)
    .with("metric", () => t`Metrics that use ${nodeLabel}`)
    .with("table", () => t`Tables that use ${nodeLabel}`)
    .with("transform", () => t`Transforms that use ${nodeLabel}`)
    .with("snippet", () => t`Snippets that use ${nodeLabel}`)
    .exhaustive();
}
