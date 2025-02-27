import { useEffect } from "react";
import { usePrevious } from "react-use";

/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { getEventHandlers } from "embedding-sdk/store/selectors";
import {
  getIsLoading,
  getIsLoadingWithoutCards,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import type { PublicOrEmbeddedDashboardEventHandlersProps } from "metabase/public/containers/PublicOrEmbeddedDashboard/types";
import { getErrorPage } from "metabase/selectors/app";
import type { Dashboard } from "metabase-types/api";

export const useDashboardLoadHandlers = ({
  dashboard,
  onLoad,
  onLoadWithoutCards,
}: {
  dashboard: Dashboard | null;
} & PublicOrEmbeddedDashboardEventHandlersProps) => {
  const isLoading = useSelector(getIsLoading);
  const isLoadingWithoutCards = useSelector(getIsLoadingWithoutCards);
  const isErrorPage = useSelector(getErrorPage);

  const previousIsLoading = usePrevious(isLoading);
  const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

  const sdkEventHandlers = useSelector(getEventHandlers);

  useEffect(() => {
    if (
      !isLoadingWithoutCards &&
      previousIsLoadingWithoutCards &&
      !isErrorPage
    ) {
      sdkEventHandlers?.onDashboardLoadWithoutCards?.(dashboard);
      onLoadWithoutCards?.(dashboard);
    }
  }, [
    isLoadingWithoutCards,
    isErrorPage,
    previousIsLoadingWithoutCards,
    dashboard,
    sdkEventHandlers,
    onLoadWithoutCards,
  ]);

  useEffect(() => {
    if (!isLoading && previousIsLoading && !isErrorPage) {
      sdkEventHandlers?.onDashboardLoad?.(dashboard);
      onLoad?.(dashboard);
    }
  }, [
    isLoading,
    isErrorPage,
    previousIsLoading,
    sdkEventHandlers,
    dashboard,
    onLoad,
  ]);
};
