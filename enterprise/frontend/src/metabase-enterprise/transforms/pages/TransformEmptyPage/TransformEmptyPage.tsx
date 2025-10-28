import { t } from "ttag";

import { BenchEmptyState } from "metabase/bench/components/shared/BenchEmptyState";

export function TransformEmptyPage() {
  return (
    <BenchEmptyState
      title={t`Pick a transform or create a new one`}
      icon="transform"
    />
  );
}
