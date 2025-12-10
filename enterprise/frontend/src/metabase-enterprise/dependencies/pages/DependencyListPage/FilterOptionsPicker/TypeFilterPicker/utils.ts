import { t } from "ttag";

import type { DependencyGroupType } from "metabase-types/api";

export function getDependencyGroupOptions(
  availableGroupTypes: DependencyGroupType[],
) {
  const labelByValue: Record<DependencyGroupType, string> = {
    question: t`Question`,
    model: t`Model`,
    metric: t`Metric`,
    table: t`Table`,
    transform: t`Transform`,
    snippet: t`Snippet`,
    dashboard: t`Dashboard`,
    document: t`Document`,
    sandbox: t`Sandbox`,
    segment: t`Segment`,
  };

  return availableGroupTypes.map((value) => ({
    value,
    label: labelByValue[value],
  }));
}
