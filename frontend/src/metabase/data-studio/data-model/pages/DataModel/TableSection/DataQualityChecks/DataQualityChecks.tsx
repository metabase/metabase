import { t } from "ttag";

import { Anchor, Loader } from "metabase/ui";

const DATA_QUALITY_URL = "https://github.com/metabase/data-quality";

export function DataQualityChecks({
  failingCount,
}: {
  failingCount: number | null;
}) {
  if (failingCount == null) {
    return <Loader size="xs" />;
  }
  return (
    <Anchor href={DATA_QUALITY_URL} target="_blank" rel="noreferrer">
      {failingCount > 0 ? t`${failingCount} failing` : t`All passing`}
    </Anchor>
  );
}
