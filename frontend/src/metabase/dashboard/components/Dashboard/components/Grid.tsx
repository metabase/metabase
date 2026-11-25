import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { Box } from "metabase/ui";
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
  const gridSample =
    sketch && hasSketchCards ? (
      <MeasuredSkeleton loading alwaysFromSample classic={classicSkeleton}>
        <DashboardGridSample sketch={sketch} />
      </MeasuredSkeleton>
    ) : null;

  if (isLoading) {
    // A dashboard never shown before has no layout to draw yet. Otherwise the
    // skeleton is swapped for the real grid at once, rather than revealed: the
    // cards land where their skeletons were, and each reveals itself whole
    // once its query is done (see DashCardCrossfade)
    return gridSample ?? classicSkeleton;
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
    <SampleUntilGridDrawn sample={gridSample}>
      <DashboardGridConnected
        handleSetEditing={handleSetEditing}
        className={className}
        style={style}
        p={p}
      />
    </SampleUntilGridDrawn>
  );
};

/**
 * The grid draws nothing on its first render, until it has measured its
 * width, which on a large dashboard can be a couple hundred milliseconds
 * after the dashboard arrives. Until then, the grid's skeleton stays in its
 * place, over the grid laid out unseen, so the page doesn't blank between the
 * two. Once the grid has drawn, it stays in charge of its own loading states.
 */
const SampleUntilGridDrawn = ({
  sample,
  children,
}: {
  sample: ReactNode;
  children: ReactNode;
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isGridDrawn, setIsGridDrawn] = useState(sample == null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (isGridDrawn || !grid) {
      return;
    }
    const checkGridDrawn = () => {
      if (grid.querySelector(".react-grid-layout")) {
        setIsGridDrawn(true);
      }
    };
    checkGridDrawn();
    const observer = new MutationObserver(checkGridDrawn);
    observer.observe(grid, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isGridDrawn]);

  return (
    <Box pos="relative">
      <Box
        ref={gridRef}
        pos={isGridDrawn ? undefined : "absolute"}
        top={0}
        left={0}
        right={0}
        style={isGridDrawn ? undefined : { visibility: "hidden" }}
      >
        {children}
      </Box>
      {!isGridDrawn && sample}
    </Box>
  );
};
