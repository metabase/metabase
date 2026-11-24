import { useCallback, useEffect, useMemo } from "react";

import { MeasuredSkeleton } from "metabase/common/components/Skeletons";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import {
  getSketchLandingCards,
  saveDashboardSketch,
  useDashboardSketch,
} from "metabase/dashboard/dashboard-sketch";
import { getDashboardHeaderParameters } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";
import type { DashboardCard } from "metabase-types/api";

import { useDashboardContext } from "../../../context";
import {
  DashboardGridConnected,
  type DashboardGridProps,
} from "../../DashboardGrid";
import { DashboardGridSkeleton } from "../../DashboardGridSkeleton";
import { DashboardGridSample } from "../../DashboardSketchSamples";
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
    dashboardId,
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
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const canCreateQuestions = hasDataAccess || hasNativeWrite;

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

  // A refetch of a dashboard that's already open keeps its cards on screen,
  // but shouldn't flash the empty state while it might be gaining cards.
  const isRefetchingWhileEmpty = isLoadingWithoutCards && isEmpty;
  const isLoading = !dashboard || isRefetchingWhileEmpty;

  const headerParameters = useSelector(getDashboardHeaderParameters);
  const sketch = useDashboardSketch(dashboardId);
  const hasSketchCards =
    sketch != null && getSketchLandingCards(sketch).length > 0;

  useEffect(() => {
    if (dashboard && !isLoading && !isEditing) {
      saveDashboardSketch({
        dashboard,
        selectedTabId,
        tabDashcards: currentTabDashcards,
        headerParameters,
      });
    }
  }, [
    dashboard,
    isLoading,
    isEditing,
    selectedTabId,
    currentTabDashcards,
    headerParameters,
  ]);

  const classicSkeleton = <DashboardGridSkeleton dashboardId={dashboardId} />;

  // A dashboard never shown before has no layout to draw yet
  if (isLoading && !hasSketchCards) {
    return classicSkeleton;
  }

  const renderContent = () => {
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

    return (
      <DashboardGridConnected
        handleSetEditing={handleSetEditing}
        className={className}
        style={style}
        p={p}
      />
    );
  };

  return (
    <MeasuredSkeleton
      loading={isLoading}
      alwaysFromSample
      classic={classicSkeleton}
    >
      {isLoading && sketch ? (
        <DashboardGridSample sketch={sketch} />
      ) : (
        renderContent()
      )}
    </MeasuredSkeleton>
  );
};
