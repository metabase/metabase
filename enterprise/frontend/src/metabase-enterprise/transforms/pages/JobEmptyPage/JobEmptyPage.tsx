import { t } from "ttag";

import { BenchEmptyState } from "metabase/bench/components/BenchEmptyState";

export function JobEmptyPage() {
  return (
    <BenchEmptyState
      title={t`Pick a job or create a new one`}
      icon="play_outlined"
    />
  );
}
