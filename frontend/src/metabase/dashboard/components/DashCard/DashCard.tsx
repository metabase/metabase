import React, { useCallback, useMemo, useRef, useState } from "react";
import { getIn } from "icepick";
import type { LocationDescriptor } from "history";

import { useMount } from "react-use";
import { IconProps } from "metabase/components/Icon";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import Utils from "metabase/lib/utils";

import {
  getGenericErrorMessage,
  getPermissionErrorMessage,
} from "metabase/visualizations/lib/errors";
import { mergeSettings } from "metabase/visualizations/lib/settings";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import { isActionCard } from "metabase/actions/utils";

import ErrorBoundary from "metabase/ErrorBoundary";

import type {
  Card,
  CardId,
  DatasetData,
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  ParameterId,
  ParameterValueOrArray,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";

import type Mode from "metabase-lib/Mode";
import type Metadata from "metabase-lib/metadata/Metadata";

import {
  CardSlownessStatus,
  NavigateToNewCardFromDashboardOpts,
  DashCardOnChangeCardAndRunHandler,
} from "./types";
import DashCardActionButtons from "./DashCardActionButtons";
import DashCardVisualization from "./DashCardVisualization";
import { DashCardRoot, DashboardCardActionsPanel } from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

function preventDragging(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function getSeriesError(series: Series) {
  const isAccessRestricted = series.some(
    s =>
      s.error_type === SERVER_ERROR_TYPES.missingPermissions ||
      s.error?.status === 403,
  );

  if (isAccessRestricted) {
    return {
      message: getPermissionErrorMessage(),
      icon: "key",
    };
  }

  const errors = series.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || getGenericErrorMessage();
      return { message, icon: "warning" };
    }
    return {
      message: getGenericErrorMessage(),
      icon: "warning",
    };
  }

  return;
}

interface DashCardProps {
  dashboard: Dashboard;
  dashcard: DashboardOrderedCard & { justAdded?: boolean };
  gridItemWidth: number;
  totalNumGridCols: number;
  dashcardData: Record<DashCardId, Record<CardId, DatasetData>>;
  slowCards: Record<CardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  metadata: Metadata;
  mode?: Mode;

  clickBehaviorSidebarDashcard?: DashboardOrderedCard | null;

  isEditing?: boolean;
  isEditingParameter?: boolean;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isNightMode?: boolean;
  isPublic?: boolean;

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

function DashCard({
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
        card.query_average_duration < DATASET_USUALLY_FAST_THRESHOLD,
    }));
  }, [cards, dashcard.id, dashcardData, slowCards]);

  const isLoading = useMemo(() => {
    if (isVirtualDashCard(dashcard)) {
      return false;
    }
    const hasSeries = series.length > 0 && series.every(s => s.data);
    return !hasSeries;
  }, [dashcard, series]);

  const isAction = isActionCard(mainCard);
  const isEmbed = Utils.isJWT(dashcard.dashboard_id);

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

  const error = useMemo(() => getSeriesError(series), [series]);
  const hasError = !!error;

  const parameterValuesBySlug = useMemo(
    () => getParameterValuesBySlug(dashboard.parameters, parameterValues),
    [dashboard.parameters, parameterValues],
  );

  const gridSize = useMemo(
    () => ({ width: dashcard.size_x, height: dashcard.size_y }),
    [dashcard],
  );

  const shouldAutoPreview = useMemo(() => {
    if (!isEditing) {
      return false;
    }

    const isHeadingCard = mainCard.display === "heading";
    const isTextCard = mainCard.display === "text";

    return (
      isHeadingCard ||
      (isTextCard &&
        mainCard.visualization_settings["dashcard.background"] === false)
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

  const renderDashCardActions = useCallback(() => {
    if (isEditingDashboardLayout) {
      return (
        <DashboardCardActionsPanel
          onMouseDown={preventDragging}
          data-testid="dashboardcard-actions-panel"
        >
          <DashCardActionButtons
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
        </DashboardCardActionsPanel>
      );
    }

    return null;
  }, [
    dashcard,
    dashboard,
    series,
    hasError,
    isLoading,
    isPreviewingCard,
    isEditingDashboardLayout,
    onAddSeries,
    onRemove,
    onReplaceAllVisualizationSettings,
    onUpdateVisualizationSettings,
    handlePreviewToggle,
    handleShowClickBehaviorSidebar,
  ]);

  return (
    <ErrorBoundary>
      <DashCardRoot
        data-testid="dashcard"
        className="Card rounded flex flex-column hover-parent hover--visibility"
        hasHiddenBackground={hasHiddenBackground}
        shouldAutoPreview={shouldAutoPreview}
        isNightMode={isNightMode}
        isUsuallySlow={isSlow === "usually-slow"}
        ref={cardRootRef}
      >
        {renderDashCardActions()}
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
          isAction={isAction}
          isEmbed={isEmbed}
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

export default Object.assign(DashCard, {
  root: DashCardRoot,
});
