import { t } from "ttag";

import { BenchTabs } from "metabase/bench/components/shared/BenchTabs";
import type { Transform } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export function TransformTabs({ transform }: TransformTabsProps) {
  return (
    <BenchTabs
      tabs={[
        { label: t`Query`, to: `/bench/transforms/${transform.id}` },
        {
          label: t`Run`,
          to: `/bench/transforms/${transform.id}/run`,
        },
        {
          label: t`Target`,
          to: `/bench/transforms/${transform.id}/target`,
        },
      ]}
    />
  );
}
