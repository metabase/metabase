import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListDatabasesQuery } from "metabase/api";
import { useDashboardContext } from "metabase/dashboard/context";
import { useSelector } from "metabase/lib/redux";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { getUser } from "metabase/selectors/user";
import { Loader, Stack, Text } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

import {
  DashboardGridConnected,
  type DashboardGridProps,
} from "../../DashboardGrid";
import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "../DashboardEmptyState/DashboardEmptyState";

export const Grid = ({
  className,
  style,
  p,
}: Pick<DashboardGridProps, "className" | "style" | "p">) => {
  const {
    dashboard,
    selectedTabId,
    isEditing,
    onRefreshPeriodChange,
    isLoadingWithoutCards,
    onAddQuestion,
    isEditableDashboard,
  } = useDashboardContext();

  const currentTabDashcards = useMemo(() => {
    if (!dashboard || !Array.isArray(dashboard.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    );
  }, [dashboard, selectedTabId]);
  const tabHasCards = currentTabDashcards.length > 0;
  const dashboardHasCards = dashboard && dashboard.dashcards.length > 0;

  /**
   * In the original code before (metabase#59529), we render `DashboardEmptyStateWithoutAddPrompt` directly
   * inside `PublicOrEmbeddedDashboardView` and this component doesn't need to check conditions that relies
   * on `GET /api/database`. After the consolidation every dashboard uses the same component, so we probably
   * missed this case.
   */
  const isLoggedIn = useSelector((state) => !!getUser(state));
  const { data: databasesResponse, isError } = useListDatabasesQuery(
    isLoggedIn ? undefined : skipToken,
  );
  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );
  const hasDataAccess = useMemo(() => getHasDataAccess(databases), [databases]);
  const hasNativeWrite = useMemo(
    () => getHasNativeWrite(databases),
    [databases],
  );
  const canCreateQuestions = !isError && (hasDataAccess || hasNativeWrite);

  const handleSetEditing = useCallback(() => {
    if (!isEditing) {
      onRefreshPeriodChange(null);
    }
  }, [isEditing, onRefreshPeriodChange]);

  const handleAddQuestion = useCallback(() => {
    handleSetEditing();
    onAddQuestion?.(dashboard);
  }, [handleSetEditing, dashboard, onAddQuestion]);

  const isEmpty = !dashboardHasCards || (dashboardHasCards && !tabHasCards);

  if (isLoadingWithoutCards) {
    return (
      <Stack justify="center" align="center" gap="sm" mt="xl">
        <Loader size="lg" />
        <Text c="text-disabled" size="xl">{t`Loading…`}</Text>
      </Stack>
    );
  }

  if (isEmpty) {
    if (!dashboardHasCards) {
      return isEditableDashboard ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={true}
          isEditing={isEditing}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt isDashboardEmpty={true} />
      );
    }

    if (dashboardHasCards && !tabHasCards) {
      return isEditableDashboard ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={false}
          isEditing={isEditing}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt isDashboardEmpty={false} />
      );
    }
  }

  return (
    <DashboardGridConnected
      handleSetEditing={handleSetEditing}
      className={className}
      style={style}
      p={p}
    />
  );
};
