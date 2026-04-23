import { Ellipsified } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import type { DependencyNode } from "metabase-types/api";

import { getDependencyErrorInfo, getDependencyErrors } from "../../../utils";

type ErrorsCellProps = {
  node: DependencyNode;
};

export function ErrorsCell({ node }: ErrorsCellProps) {
  const errors = getDependencyErrors(node.dependents_errors ?? []);
  const errorsInfo = getDependencyErrorInfo(errors);

  if (!errorsInfo) {
    return null;
  }

  const fullText = errorsInfo.detail
    ? `${errorsInfo.label} ${errorsInfo.detail}`
    : errorsInfo.label;

  return (
    <Ellipsified
      tooltip={fullText}
      tooltipProps={{ openDelay: TOOLTIP_OPEN_DELAY }}
    >
      <span>{errorsInfo.label}</span>{" "}
      {errorsInfo.detail && <strong>{errorsInfo.detail}</strong>}
    </Ellipsified>
  );
}
