import { t } from "ttag";

import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
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
          to: `/bench/transforms/${transform.id}`,
          icon: "sql",
        },
        {
          label: t`Run`,
          to: `/bench/transforms/${transform.id}/run`,
          icon: "play_outlined",
        },
        {
          label: t`Target`,
          to: `/bench/transforms/${transform.id}/target`,
          icon: "table2",
        },
        ...(PLUGIN_DEPENDENCIES.isEnabled
          ? [
              {
                label: t`Dependencies`,
                to: `/bench/transforms/${transform.id}/dependencies`,
                icon: "network" as const,
              },
            ]
          : []),
      ]}
    />
  );
}
