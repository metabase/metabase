import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  clearExport,
  getAnalyticsExport,
} from "metabase/redux/analytics-export";

import useStatusVisibility from "../../hooks/use-status-visibility";
import StatusLarge from "../StatusLarge";

export const AnalyticsExportStatus = () => {
  const dispatch = useDispatch();
  const exportState = useSelector(getAnalyticsExport);
  const hasStatus = exportState.status != null;
  const isVisible = useStatusVisibility(hasStatus);

  const resetExport = () => dispatch(clearExport());

  if (!isVisible || !exportState.status) {
    return null;
  }

  const hasError = exportState.status === "error";
  const isLoading = exportState.status === "in-progress";
  const isDone = exportState.status === "complete";

  const title = isLoading
    ? t`Exporting analytics content…`
    : isDone
      ? t`Analytics content exported`
      : t`Error exporting analytics`;

  const status = {
    title,
    items: [
      {
        title: t`Usage analytics`,
        icon: "download" as const,
        description: hasError ? (exportState.message ?? t`Export failed`) : "",
        isInProgress: isLoading,
        isCompleted: isDone,
        isAborted: hasError,
      },
    ],
  };

  return (
    <ErrorBoundary>
      <StatusLarge
        status={status}
        isActive={hasStatus}
        onDismiss={!isLoading ? resetExport : undefined}
      />
    </ErrorBoundary>
  );
};
