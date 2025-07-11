import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useDashboardContext } from "metabase/dashboard/context";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
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
    slowCards,
    clickBehaviorSidebarDashcard,
    navigateToNewCardFromDashboard,
    downloadsEnabled,
    isEditing,
    isEditingParameter,
    isFullscreen,
    isNightMode,
    getClickActionMode,
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
    onRefreshPeriodChange,
    shouldRenderAsNightMode,
    isLoadingWithoutCards,
    onAddQuestion,
  } = useDashboardContext();

  const canWrite = Boolean(dashboard?.can_write);
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

  const { data: databasesResponse, isError } = useListDatabasesQuery();
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
        <Text c="text-light" size="xl">{t`Loading…`}</Text>
      </Stack>
    );
  }

  if (isEmpty) {
    if (!dashboardHasCards) {
      return canWrite ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={true}
          isEditing={isEditing}
          isNightMode={shouldRenderAsNightMode}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt
          isDashboardEmpty={true}
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }

    if (dashboardHasCards && !tabHasCards) {
      return canWrite ? (
        <DashboardEmptyState
          canCreateQuestions={canCreateQuestions}
          addQuestion={handleAddQuestion}
          isDashboardEmpty={false}
          isEditing={isEditing}
          isNightMode={shouldRenderAsNightMode}
        />
      ) : (
        <DashboardEmptyStateWithoutAddPrompt
          isDashboardEmpty={false}
          isNightMode={shouldRenderAsNightMode}
        />
      );
    }
  }

  return (
    <DashboardGridConnected
      dashboard={dashboard}
      selectedTabId={selectedTabId}
      slowCards={slowCards}
      clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
      navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      downloadsEnabled={downloadsEnabled}
      isEditing={isEditing}
      isEditingParameter={isEditingParameter}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      getClickActionMode={getClickActionMode}
      autoScrollToDashcardId={autoScrollToDashcardId}
      reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
      handleSetEditing={handleSetEditing}
      className={className}
      style={style}
      p={p}
    />
  );
};
