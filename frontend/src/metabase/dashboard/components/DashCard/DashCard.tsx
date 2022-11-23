import React, { useCallback, useMemo, useRef, useState } from "react";
import cx from "classnames";
import { t } from "ttag";
import { connect } from "react-redux";
import { getIn } from "icepick";
import type { LocationDescriptor } from "history";

import { IconProps } from "metabase/components/Icon";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { SERVER_ERROR_TYPES } from "metabase/lib/errors";
import Utils from "metabase/lib/utils";

import { useOnMount } from "metabase/hooks/use-on-mount";

import Visualization, {
  ERROR_MESSAGE_GENERIC,
  ERROR_MESSAGE_PERMISSION,
} from "metabase/visualizations/components/Visualization";
import WithVizSettingsData from "metabase/visualizations/hoc/WithVizSettingsData";
import { mergeSettings } from "metabase/visualizations/lib/settings";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";

import { isVirtualDashCard } from "metabase/dashboard/utils";

import { isActionCard } from "metabase/writeback/utils";

import type {
  Card,
  CardId,
  Dashboard,
  DashboardOrderedCard,
  DashCardId,
  VisualizationSettings,
} from "metabase-types/api";
import type { DatasetData } from "metabase-types/types/Dataset";
import type {
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import type { Series } from "metabase-types/types/Visualization";
import type { Dispatch } from "metabase-types/store";

import { getParameterValuesBySlug } from "metabase-lib/parameters/utils/parameter-values";

import type Mode from "metabase-lib/Mode";
import type Metadata from "metabase-lib/metadata/Metadata";

import ClickBehaviorSidebarOverlay from "./ClickBehaviorSidebarOverlay";
import DashCardActionButtons from "./DashCardActionButtons";
import DashCardParameterMapper from "./DashCardParameterMapper";
import {
  DashCardRoot,
  DashboardCardActionsPanel,
  VirtualDashCardOverlayRoot,
  VirtualDashCardOverlayText,
} from "./DashCard.styled";

const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.
const WrappedVisualization = WithVizSettingsData(
  connect(null, dispatch => ({ dispatch }))(Visualization),
);

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
      message: ERROR_MESSAGE_PERMISSION,
      icon: "key",
    };
  }

  const errors = series.map(s => s.error).filter(Boolean);
  if (errors.length > 0) {
    if (IS_EMBED_PREVIEW) {
      const message = errors[0]?.data || ERROR_MESSAGE_GENERIC;
      return { message, icon: "warning" };
    }
    return {
      message: ERROR_MESSAGE_GENERIC,
      icon: "warning",
    };
  }

  return;
}

type FetchCardDataOpts = {
  reload?: boolean;
  clear?: boolean;
  ignoreCache?: boolean;
};

type NavigateToNewCardFromDashboardOpts = {
  nextCard: Card;
  previousCard: Card;
  dashcard: DashboardOrderedCard;
  objectId?: unknown;
};

type CardIsSlow = "usually-fast" | "usually-slow" | false;

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

  headerIcon?: IconProps;

  dispatch: Dispatch;
  onAddSeries: () => void;
  onRemove: () => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  fetchCardData: (
    card: Card,
    dashCard: DashboardOrderedCard,
    opts?: FetchCardDataOpts,
  ) => void;
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
  dispatch,
}: DashCardProps) {
  const [isPreviewingCard, setIsPreviewingCard] = useState(false);
  const cardRootRef = useRef<HTMLDivElement>(null);

  const handlePreviewToggle = useCallback(() => {
    setIsPreviewingCard(wasPreviewingCard => !wasPreviewingCard);
  }, []);

  useOnMount(() => {
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
    let isSlow: CardIsSlow = false;
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

  const hasHiddenBackground = useMemo(() => {
    if (isEditing) {
      return false;
    }

    return (
      mainCard.visualization_settings["dashcard.background"] === false ||
      mainCard.display === "list" ||
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

    type Args = Omit<NavigateToNewCardFromDashboardOpts, "dashcard">;
    return ({ nextCard, previousCard, objectId }: Args) => {
      navigateToNewCardFromDashboard({
        nextCard,
        previousCard,
        dashcard,
        objectId,
      });
    };
  }, [dashcard, navigateToNewCardFromDashboard]);

  const renderVisualizationOverlay = useCallback(() => {
    if (isClickBehaviorSidebarOpen) {
      if (isVirtualDashCard(dashcard)) {
        const isTextCard =
          dashcard?.visualization_settings?.virtual_card?.display === "text";
        return (
          <VirtualDashCardOverlayRoot>
            <VirtualDashCardOverlayText>
              {isTextCard ? t`Text card` : t`Action button`}
            </VirtualDashCardOverlayText>
          </VirtualDashCardOverlayRoot>
        );
      }
      return (
        <ClickBehaviorSidebarOverlay
          dashcard={dashcard}
          dashcardWidth={gridItemWidth}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          isShowingThisClickBehaviorSidebar={isEditingDashCardClickBehavior}
        />
      );
    }

    if (isEditingParameter && !isAction) {
      return (
        <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
      );
    }

    return null;
  }, [
    dashcard,
    gridItemWidth,
    isAction,
    isMobile,
    isEditingParameter,
    isClickBehaviorSidebarOpen,
    isEditingDashCardClickBehavior,
    showClickBehaviorSidebar,
  ]);

  const renderDashCardActions = useCallback(() => {
    if (isEditingDashboardLayout) {
      return (
        <DashboardCardActionsPanel onMouseDown={preventDragging}>
          <DashCardActionButtons
            card={mainCard}
            series={series}
            dashboard={dashboard}
            isLoading={isLoading}
            isPreviewing={isPreviewingCard}
            isVirtualDashCard={isVirtualDashCard(dashcard)}
            hasError={hasError}
            onAddSeries={onAddSeries}
            onRemove={onRemove}
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
    mainCard,
    series,
    hasError,
    isLoading,
    isPreviewingCard,
    isEditingDashboardLayout,
    onAddSeries,
    onRemove,
    onReplaceAllVisualizationSettings,
    handlePreviewToggle,
    handleShowClickBehaviorSidebar,
  ]);

  const renderActionButtons = useCallback(() => {
    if (isEmbed) {
      return (
        <QueryDownloadWidget
          className="m1 text-brand-hover text-light"
          classNameClose="hover-child"
          card={dashcard.card}
          params={parameterValuesBySlug}
          dashcardId={dashcard.id}
          token={dashcard.dashboard_id}
          icon="download"
          // Can be removed once QueryDownloadWidget is converted to Typescript
          visualizationSettings={undefined}
        />
      );
    }
    return null;
  }, [dashcard, parameterValuesBySlug, isEmbed]);

  return (
    <DashCardRoot
      className="Card rounded flex flex-column hover-parent hover--visibility"
      hasHiddenBackground={hasHiddenBackground}
      isNightMode={isNightMode}
      isUsuallySlow={isSlow === "usually-slow"}
      ref={cardRootRef}
    >
      {renderDashCardActions()}
      <WrappedVisualization
        // Visualization has to be converted to TypeScript before we can remove the ts-ignore
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        className={cx("flex-full overflow-hidden", {
          "pointer-events-none": isEditingDashboardLayout,
        })}
        classNameWidgets={cx({
          "text-light text-medium-hover": isEmbed,
        })}
        dashboard={dashboard}
        dashcard={dashcard}
        parameterValues={parameterValues}
        parameterValuesBySlug={parameterValuesBySlug}
        rawSeries={series}
        headerIcon={headerIcon}
        error={error?.message}
        errorIcon={error?.icon}
        gridSize={gridSize}
        metadata={metadata}
        mode={mode}
        totalNumGridCols={totalNumGridCols}
        expectedDuration={expectedDuration}
        showTitle
        replacementContent={renderVisualizationOverlay()}
        actionButtons={renderActionButtons()}
        isSlow={isSlow}
        isDataApp={false}
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        isDashboard
        isEditing={isEditing}
        isPreviewing={isPreviewingCard}
        isEditingParameter={isEditingParameter}
        isMobile={isMobile}
        onUpdateVisualizationSettings={onUpdateVisualizationSettings}
        onChangeCardAndRun={changeCardAndRunHandler}
        onChangeLocation={onChangeLocation}
        dispatch={dispatch}
      />
    </DashCardRoot>
  );
}

export default DashCard;
