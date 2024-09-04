import cx from "classnames";
import type { LocationDescriptor } from "history";
import { getIn } from "icepick";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useMount } from "react-use";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isActionCard } from "metabase/actions/utils";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import { getDashcardData, getDashcardHref } from "metabase/dashboard/selectors";
import {
  getDashcardResultsError,
  isDashcardLoading,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import { color } from "metabase/lib/colors";
import { useSelector, useStore } from "metabase/lib/redux";
import { isJWT } from "metabase/lib/utils";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import type {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  VirtualCard,
  VisualizationSettings,
} from "metabase-types/api";
import type { StoreDashcard } from "metabase-types/store";

import { DashCardRoot } from "./DashCard.styled";
import { DashCardActionsPanel } from "./DashCardActionsPanel/DashCardActionsPanel";
import { DashCardVisualization } from "./DashCardVisualization";
import type {
  CardSlownessStatus,
  DashCardOnChangeCardAndRunHandler,
  NavigateToNewCardFromDashboardOpts,
} from "./types";

function preventDragging(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export interface DashCardProps {
  dashboard: Dashboard;
  dashcard: StoreDashcard;
  gridItemWidth: number;
  totalNumGridCols: number;
  slowCards: Record<CardId, boolean>;
  mode?: QueryClickActionsMode | Mode;

  clickBehaviorSidebarDashcard?: DashboardCard | null;

  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isXray?: boolean;
  withTitle?: boolean;

  onAddSeries: (dashcard: StoreDashcard) => void;
  onReplaceCard: (dashcard: StoreDashcard) => void;
  onRemove: (dashcard: StoreDashcard) => void;
  onTrash: (dashcard: StoreDashcard) => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  onReplaceAllVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  onUpdateVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  showClickBehaviorSidebar: (dashcardId: DashCardId | null) => void;
  onChangeLocation: (location: LocationDescriptor) => void;

  downloadsEnabled: boolean;
}

function DashCardInner({
  dashcard,
  dashboard,
  slowCards,
  gridItemWidth,
  totalNumGridCols,
  mode,
  isEditing = false,
  isNightMode = false,
  isFullscreen = false,
  isMobile = false,
  isPublicOrEmbedded = false,
  isXray = false,
  isEditingParameter,
  clickBehaviorSidebarDashcard,
  withTitle = true,
  onAddSeries,
  onReplaceCard,
  onRemove,
  onTrash,
  navigateToNewCardFromDashboard,
  markNewCardSeen,
  showClickBehaviorSidebar,
  onChangeLocation,
  onUpdateVisualizationSettings,
  onReplaceAllVisualizationSettings,
  downloadsEnabled,
}: DashCardProps) {
  const dashcardData = useSelector(state =>
    getDashcardData(state, dashcard.id),
  );
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  const store = useStore();
  const getHref = useCallback(
    () => getDashcardHref(store.getState(), dashcard.id),
    [store, dashcard.id],
  );
  const [isPreviewingCard, setIsPreviewingCard] = useState(false);
  const cardRootRef = useRef<HTMLDivElement>(null);

  const handlePreviewToggle = useCallback(() => {
    setIsPreviewingCard(wasPreviewingCard => !wasPreviewingCard);
  }, []);

  useMount(() => {
    if (dashcard.justAdded) {
      cardRootRef?.current?.scrollIntoView({
        block: "nearest",
      });
      markNewCardSeen(dashcard.id);
    }
  });

  const mainCard: Card | VirtualCard = useMemo(
    () =>
      extendCardWithDashcardSettings(
        dashcard.card,
        dashcard.visualization_settings,
      ),
    [dashcard],
  );

  const cards = useMemo(() => {
    if (isQuestionDashCard(dashcard) && Array.isArray(dashcard.series)) {
      return [mainCard, ...dashcard.series];
    }
    return [mainCard];
  }, [mainCard, dashcard]);

  const series = useMemo(() => {
    return cards.map(card => {
      const isSlow = card.id ? slowCards[card.id] : false;
      const isUsuallyFast =
        card.query_average_duration &&
        card.query_average_duration < DASHBOARD_SLOW_TIMEOUT;

      if (!card.id) {
        return { card, isSlow, isUsuallyFast };
      }

      return {
        ...getIn(dashcardData, [card.id]),
        card,
        isSlow,
        isUsuallyFast,
      };
    });
  }, [cards, dashcardData, slowCards]);

  const isLoading = useMemo(
    () => isDashcardLoading(dashcard, dashcardData),
    [dashcard, dashcardData],
  );

  const isAction = isActionCard(mainCard);
  const isEmbed = isEmbeddingSdk || isJWT(dashcard.dashboard_id);

  const { expectedDuration, isSlow } = useMemo(() => {
    const expectedDuration = Math.max(
      ...series.map(s => s.card.query_average_duration || 0),
    );
    const isUsuallyFast = series.every(s => s.isUsuallyFast);
    let isSlow: CardSlownessStatus = false;
    if (isLoading && series.some(s => s.isSlow)) {
      isSlow = isUsuallyFast ? "usually-fast" : "usually-slow";
    }
    return { expectedDuration, isSlow };
  }, [series, isLoading]);

  const error = useMemo(() => getDashcardResultsError(series), [series]);
  const hasError = !!error;

  const gridSize = useMemo(
    () => ({ width: dashcard.size_x, height: dashcard.size_y }),
    [dashcard],
  );

  const shouldForceHiddenBackground = useMemo(() => {
    if (!isEditing) {
      return false;
    }

    const isHeadingCard = mainCard.display === "heading";
    const isTextCard = mainCard.display === "text";

    return (
      (isHeadingCard || isTextCard) &&
      mainCard.visualization_settings["dashcard.background"] === false
    );
  }, [isEditing, mainCard]);

  const hasHiddenBackground = useMemo(() => {
    if (isEditing) {
      return false;
    }

    return (
      mainCard.visualization_settings["dashcard.background"] === false ||
      isAction
    );
  }, [isEditing, isAction, mainCard]);

  const headerIcon = useMemo(() => {
    const { isRegularCollection } = PLUGIN_COLLECTIONS;
    const isRegularQuestion = isRegularCollection({
      authority_level: dashcard.collection_authority_level,
    });
    const isRegularDashboard = isRegularCollection({
      authority_level: dashboard.collection_authority_level,
    });
    const authorityLevel = dashcard.collection_authority_level;
    if (isRegularDashboard && !isRegularQuestion && authorityLevel) {
      const opts = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[authorityLevel];
      const iconSize = 14;
      return {
        name: opts.icon,
        color: opts.color ? color(opts.color) : undefined,
        tooltip: opts.tooltips?.belonging,
        size: iconSize,

        // Workaround: headerIcon on cards in a first column have incorrect offset out of the box
        targetOffsetX: dashcard.col === 0 ? iconSize : 0,
      };
    }
  }, [dashcard, dashboard.collection_authority_level]);

  const isEditingDashboardLayout =
    isEditing && !clickBehaviorSidebarDashcard && !isEditingParameter;

  const isClickBehaviorSidebarOpen = !!clickBehaviorSidebarDashcard;
  const isEditingDashCardClickBehavior =
    clickBehaviorSidebarDashcard?.id === dashcard.id;

  const handleShowClickBehaviorSidebar = useCallback(() => {
    showClickBehaviorSidebar(dashcard.id);
  }, [dashcard.id, showClickBehaviorSidebar]);

  const changeCardAndRunHandler =
    useCallback<DashCardOnChangeCardAndRunHandler>(
      ({ nextCard, previousCard, objectId }) => {
        return navigateToNewCardFromDashboard?.({
          nextCard,
          previousCard,
          dashcard,
          objectId,
        });
      },
      [dashcard, navigateToNewCardFromDashboard],
    );

  return (
    <ErrorBoundary>
      <DashCardRoot
        data-testid="dashcard"
        data-dashcard-key={dashcard.id}
        className={cx(
          DashboardS.Card,
          EmbedFrameS.Card,
          CS.relative,
          CS.rounded,
          CS.flex,
          CS.flexColumn,
          CS.hoverParent,
          CS.hoverVisibility,
        )}
        hasHiddenBackground={hasHiddenBackground}
        shouldForceHiddenBackground={shouldForceHiddenBackground}
        isNightMode={isNightMode}
        isUsuallySlow={isSlow === "usually-slow"}
        ref={cardRootRef}
      >
        {isEditingDashboardLayout && (
          <DashCardActionsPanel
            onMouseDown={preventDragging}
            onLeftEdge={dashcard.col === 0}
            series={series}
            dashboard={dashboard}
            dashcard={dashcard}
            isLoading={isLoading}
            isPreviewing={isPreviewingCard}
            hasError={hasError}
            onAddSeries={onAddSeries}
            onRemove={onRemove}
            onTrash={onTrash}
            onReplaceCard={onReplaceCard}
            onUpdateVisualizationSettings={onUpdateVisualizationSettings}
            onReplaceAllVisualizationSettings={
              onReplaceAllVisualizationSettings
            }
            showClickBehaviorSidebar={handleShowClickBehaviorSidebar}
            onPreviewToggle={handlePreviewToggle}
          />
        )}
        <DashCardVisualization
          dashboard={dashboard}
          dashcard={dashcard}
          series={series}
          mode={mode}
          gridSize={gridSize}
          gridItemWidth={gridItemWidth}
          totalNumGridCols={totalNumGridCols}
          headerIcon={headerIcon}
          expectedDuration={expectedDuration}
          error={error}
          getHref={navigateToNewCardFromDashboard ? getHref : undefined}
          isAction={isAction}
          isEmbed={isEmbed}
          isXray={isXray}
          isEditing={isEditing}
          isEditingDashCardClickBehavior={isEditingDashCardClickBehavior}
          isEditingDashboardLayout={isEditingDashboardLayout}
          isEditingParameter={isEditingParameter}
          isClickBehaviorSidebarOpen={isClickBehaviorSidebarOpen}
          isSlow={isSlow}
          isPreviewing={isPreviewingCard}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          isMobile={isMobile}
          isPublicOrEmbedded={isPublicOrEmbedded}
          withTitle={withTitle}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onChangeCardAndRun={
            navigateToNewCardFromDashboard ? changeCardAndRunHandler : null
          }
          onChangeLocation={onChangeLocation}
          downloadsEnabled={downloadsEnabled}
        />
      </DashCardRoot>
    </ErrorBoundary>
  );
}

export const DashCard = Object.assign(memo(DashCardInner), {
  root: DashCardRoot,
});
