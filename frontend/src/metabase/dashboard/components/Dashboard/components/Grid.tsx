import { type DragEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import { addCardToDashboard } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  isArtifactDrag,
  readArtifactDragData,
} from "metabase/metabot/components/MetabotBar/artifactDragData";
import { useDispatch, useSelector } from "metabase/redux";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { Box, Loader } from "metabase/ui";
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

  const dispatch = useDispatch();

  // Empty tabs render an empty state instead of the grid, so the grid's own
  // artifact drop target isn't mounted — make the empty state droppable too.
  const handleArtifactDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (isEditing && isArtifactDrag(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleArtifactDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isEditing || !dashboard) {
      return;
    }
    const artifact = readArtifactDragData(e.dataTransfer);
    if (artifact?.model === "card") {
      e.preventDefault();
      dispatch(
        addCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId ?? null,
          cardId: artifact.id,
        }),
      );
    }
  };

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

  if (isLoadingWithoutCards) {
    return <Loader size="lg" label={t`Loading…`} />;
  }

  if (isEmpty) {
    const isDashboardEmpty = !dashboardHasCards;
    return (
      <Box
        h="100%"
        w="100%"
        onDragOver={handleArtifactDragOver}
        onDrop={handleArtifactDrop}
      >
        {isEditableDashboard ? (
          <DashboardEmptyState
            canCreateQuestions={canCreateQuestions}
            addQuestion={handleAddQuestion}
            isDashboardEmpty={isDashboardEmpty}
            isEditing={isEditing}
          />
        ) : (
          <DashboardEmptyStateWithoutAddPrompt
            isDashboardEmpty={isDashboardEmpty}
          />
        )}
      </Box>
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
