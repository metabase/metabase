import { useCallback, useMemo, useRef, useState } from "react";
import { getIn } from "icepick";
import type { LocationDescriptor } from "history";

import { useMount } from "react-use";
import type { IconProps } from "metabase/core/components/Icon";

import { isJWT } from "metabase/lib/utils";

import { mergeSettings } from "metabase/visualizations/lib/settings";

import {
  getDashcardResultsError,
  isDashcardLoading,
  isVirtualDashCard,
} from "metabase/dashboard/utils";

import { isActionCard } from "metabase/actions/utils";

import ErrorBoundary from "metabase/ErrorBoundary";

import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  DashCardId,
  ParameterId,
  ParameterValueOrArray,
  VisualizationSettings,
  Dataset,
} from "metabase-types/api";

import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";

import type Metadata from "metabase-lib/metadata/Metadata";

import type {
  CardSlownessStatus,
  NavigateToNewCardFromDashboardOpts,
  DashCardOnChangeCardAndRunHandler,
} from "./types";
import { DashCardActionsPanel } from "./DashCardActionsPanel/DashCardActionsPanel";
import { DashCardVisualization } from "./DashCardVisualization";
import { DashCardRoot } from "./DashCard.styled";

function preventDragging(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export interface DashCardProps {
  dashboard: Dashboard;
  dashcard: DashboardCard & { justAdded?: boolean };
  gridItemWidth: number;
  totalNumGridCols: number;
  dashcardData: Record<DashCardId, Record<CardId, Dataset>>;
  slowCards: Record<CardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  metadata: Metadata;
  mode?: Mode;

  clickBehaviorSidebarDashcard?: DashboardCard | null;

  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;
  isPublic?: boolean;
  isXray?: boolean;

  headerIcon?: IconProps;

  onAddSeries: () => void;
  onRemove: () => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
  onUpdateVisualizationSettings: (settings: VisualizationSettings) => void;
  showClickBehaviorSidebar: (dashCardId: DashCardId | null) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function DashCardInner({
  dashcard,
  dashcardData,
  dashboard,
  slowCards,
  metadata,
  parameterValues,
  gridItemWidth,
  totalNumGridCols,
  mode,
  isEditing = false,
  isNightMode = false,
  isFullscreen = false,
  isMobile = false,
  isPublic = false,
  isXray = false,
  isEditingParameter,
  clickBehaviorSidebarDashcard,
  headerIcon,
  onAddSeries,
  onRemove,
  navigateToNewCardFromDashboard,
  markNewCardSeen,
  showClickBehaviorSidebar,
  onChangeLocation,
  onUpdateVisualizationSettings,
  onReplaceAllVisualizationSettings,
}: DashCardProps) {
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

  const mainCard: Card = useMemo(
    () => ({
      ...dashcard.card,
      visualization_settings: mergeSettings(
        dashcard.card.visualization_settings,
        dashcard.visualization_settings,
      ),
    }),
    [dashcard],
  );

  const cards = useMemo(() => {
    if (Array.isArray(dashcard.series)) {
      return [mainCard, ...dashcard.series];
    }
    return [mainCard];
  }, [mainCard, dashcard]);

  const series = useMemo(() => {
    return cards.map(card => ({
      ...getIn(dashcardData, [dashcard.id, card.id]),
      card: card,
      isSlow: slowCards[card.id],
      isUsuallyFast:
        card.query_average_duration &&
        card.query_average_duration < DASHBOARD_SLOW_TIMEOUT,
    }));
  }, [cards, dashcard.id, dashcardData, slowCards]);

  const isLoading = useMemo(
    () => isDashcardLoading(dashcard, dashcardData),
    [dashcard, dashcardData],
  );

  const isAction = isActionCard(mainCard);
  const isEmbed = isJWT(dashcard.dashboard_id);

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

  const parameterValuesBySlug = useMemo(
    () => getParameterValuesBySlug(dashboard.parameters, parameterValues),
    [dashboard.parameters, parameterValues],
  );

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

  const isEditingDashboardLayout =
    isEditing && !clickBehaviorSidebarDashcard && !isEditingParameter;

  const isClickBehaviorSidebarOpen = !!clickBehaviorSidebarDashcard;
  const isEditingDashCardClickBehavior =
    clickBehaviorSidebarDashcard?.id === dashcard.id;

  const handleShowClickBehaviorSidebar = useCallback(() => {
    showClickBehaviorSidebar(dashcard.id);
  }, [dashcard.id, showClickBehaviorSidebar]);

  const changeCardAndRunHandler = useMemo(() => {
    if (!navigateToNewCardFromDashboard) {
      return null;
    }

    const handler: DashCardOnChangeCardAndRunHandler = ({
      nextCard,
      previousCard,
      objectId,
    }) => {
      navigateToNewCardFromDashboard({
        nextCard,
        previousCard,
        dashcard,
        objectId,
      });
    };

    return handler;
  }, [dashcard, navigateToNewCardFromDashboard]);

  return (
    <ErrorBoundary>
      <DashCardRoot
        data-testid="dashcard"
        className="Card rounded flex flex-column hover-parent hover--visibility"
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
            isVirtualDashCard={isVirtualDashCard(dashcard)}
            hasError={hasError}
            onAddSeries={onAddSeries}
            onRemove={onRemove}
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
          parameterValues={parameterValues}
          parameterValuesBySlug={parameterValuesBySlug}
          metadata={metadata}
          mode={mode}
          gridSize={gridSize}
          gridItemWidth={gridItemWidth}
          totalNumGridCols={totalNumGridCols}
          headerIcon={headerIcon}
          expectedDuration={expectedDuration}
          error={error}
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
          isPublic={isPublic}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onChangeCardAndRun={changeCardAndRunHandler}
          onChangeLocation={onChangeLocation}
        />
      </DashCardRoot>
    </ErrorBoundary>
  );
}

export const DashCard = Object.assign(DashCardInner, {
  root: DashCardRoot,
});
