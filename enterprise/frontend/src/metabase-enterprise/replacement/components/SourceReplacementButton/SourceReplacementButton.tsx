import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import type { SourceReplacementButtonProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  useListModelReplacementRunsQuery,
  useListSourceReplacementRunsQuery,
} from "metabase-enterprise/api";

export function SourceReplacementButton({
  children,
}: SourceReplacementButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: activeSourceRuns = [], isLoading: isSourceRunsLoading } =
    useListSourceReplacementRunsQuery(
      { "is-active": true },
      { skip: !isAdmin },
    );
  const { data: activeModelRuns = [], isLoading: isModelRunsLoading } =
    useListModelReplacementRunsQuery({ "is-active": true }, { skip: !isAdmin });

  const activeRuns = [...activeSourceRuns, ...activeModelRuns];
  const hasActiveRuns = activeRuns.length > 0;
  const isLoading = isSourceRunsLoading || isModelRunsLoading;
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
