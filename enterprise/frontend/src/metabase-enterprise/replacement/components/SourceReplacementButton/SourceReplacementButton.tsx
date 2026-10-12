import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { SourceReplacementButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useListSourceReplacementRunsQuery } from "metabase-enterprise/api";

export function SourceReplacementButton({
  children,
}: SourceReplacementButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: activeRuns = [], isLoading } =
    useListSourceReplacementRunsQuery(
      { "is-active": true },
      { skip: !isAdmin },
    );
  const hasActiveRuns = activeRuns.length > 0;
  const isDisabled = isLoading || hasActiveRuns;

  if (!isAdmin) {
    return null;
  }

  return children({
    tooltip: hasActiveRuns
      ? t`Only one active source replacement run is allowed at a time.`
      : undefined,
    isDisabled,
  });
}
