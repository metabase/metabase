import type { DependencyNode } from "metabase-types/api";

import { getDependencyErrorInfo } from "../../../../utils";

type ErrorsCellProps = {
  node: DependencyNode;
};

export function ErrorsCell({ node }: ErrorsCellProps) {
  const errors = node.errors ?? [];
  const errorsInfo = getDependencyErrorInfo(errors);

  if (!errorsInfo) {
    return null;
  }

  return (
    <div>
      <span>{errorsInfo.label}</span>{" "}
      {errorsInfo.detail && <strong>{errorsInfo.detail}</strong>}
    </div>
  );
}
