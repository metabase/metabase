import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import StatusLarge from "metabase/status/components/StatusLarge";
import useStatusVisibility from "metabase/status/hooks/use-status-visibility";

import { ANALYTICS_EXPORT_CACHE_KEY, useExportAnalyticsMutation } from "../api";

export const AnalyticsExportStatus = () => {
  const [, { isLoading, isSuccess, isError, error, reset }] =
    useExportAnalyticsMutation({ fixedCacheKey: ANALYTICS_EXPORT_CACHE_KEY });
  const hasStatus = isLoading || isSuccess || isError;
  const isVisible = useStatusVisibility(hasStatus);

  if (!isVisible || !hasStatus) {
    return null;
  }

  const title = isLoading
    ? t`Exporting analytics content…`
    : isSuccess
      ? t`Analytics content exported`
      : t`Error exporting analytics`;

  const errorMessage = error instanceof Error ? error.message : undefined;

  const status = {
    title,
    items: [
      {
        title: t`Usage analytics`,
        icon: "download" as const,
        description: isError
          ? (errorMessage ?? t`Failed to export analytics`)
          : "",
        isInProgress: isLoading,
        isCompleted: isSuccess,
        isAborted: isError,
      },
    ],
  };

  return (
    <ErrorBoundary>
      <StatusLarge
        status={status}
        isActive={hasStatus}
        onDismiss={!isLoading ? reset : undefined}
      />
    </ErrorBoundary>
  );
};
