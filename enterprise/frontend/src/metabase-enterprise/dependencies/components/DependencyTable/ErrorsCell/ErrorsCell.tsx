import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { DependencyNode } from "metabase-types/api";

import { getDependencyErrorInfo, getDependencyErrors } from "../../utils";

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
    <Ellipsified tooltip={fullText} tooltipProps={{ openDelay: 300 }}>
      <span>{errorsInfo.label}</span>{" "}
      {errorsInfo.detail && <strong>{errorsInfo.detail}</strong>}
    </Ellipsified>
  );
}
