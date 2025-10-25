import { t } from "ttag";

import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type { Transform } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export function TransformTabs({ transform }: TransformTabsProps) {
  return (
    <BenchTabs
      tabs={[
        {
          label: t`Query`,
          to: Urls.transform(transform.id),
          icon: "sql",
        },
        {
          label: t`Run`,
          to: Urls.transformRun(transform.id),
          icon: "play_outlined",
        },
        {
          label: t`Target`,
          to: Urls.transformTarget(transform.id),
          icon: "table2",
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                label: t`Dependencies`,
                to: Urls.transformDependencies(transform.id),
                icon: "network" as const,
              },
            ]
          : []),
      ]}
    />
  );
}
