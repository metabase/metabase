import cx from "classnames";
import { getIn } from "icepick";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useMount, useUpdateEffect } from "react-use";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isActionCard } from "metabase/actions/utils";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { addParameter, duplicateCard } from "metabase/dashboard/actions";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { getDashcardData, getDashcardHref } from "metabase/dashboard/selectors";
import {
  getDashcardResultsError,
  isDashcardLoading,
  isQuestionCard,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import type { NewParameterOpts } from "metabase/parameters/utils/dashboards";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import { getVisualizationRaw } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import {
  getInitialStateForCardDataSource,
  getInitialStateForMultipleSeries,
  getInitialStateForVisualizerCard,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashCardId,
  DashboardCard,
  VirtualCard,
  VisualizationSettings,
} from "metabase-types/api";
import type { StoreDashcard } from "metabase-types/store";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import S from "./DashCard.module.css";
import { DashCardActionsPanel } from "./DashCardActionsPanel/DashCardActionsPanel";
import { DashCardVisualization } from "./DashCardVisualization";
import type {
  CardSlownessStatus,
  DashCardOnChangeCardAndRunHandler,
} from "./types";

function preventDragging(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export interface DashCardProps {
  dashcard: StoreDashcard;
  gridItemWidth: number;
  totalNumGridCols: number;

  clickBehaviorSidebarDashcard?: DashboardCard | null;

  isMobile?: boolean;

  /** Bool if removing the dashcard will queue the card to be trashed on dashboard save */
  isTrashedOnRemove: boolean;
  onRemove: (dashcard: StoreDashcard) => void;
  onReplaceCard: (dashcard: StoreDashcard) => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;
  onReplaceAllDashCardVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  onUpdateVisualizationSettings: (
    dashcardId: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  showClickBehaviorSidebar: (dashcardId: DashCardId | null) => void;

  /** Auto-scroll to this card on mount */
  autoScroll: boolean;

  className?: string;

  onEditVisualization: (
    dashcard: StoreDashcard,
    initialState: VisualizerVizDefinitionWithColumns,
  ) => void;
}

function DashCardInner({
  dashcard,
  isMobile,
  gridItemWidth,
  totalNumGridCols,
  clickBehaviorSidebarDashcard,
  isTrashedOnRemove,
  onRemove,
  onReplaceCard,
  markNewCardSeen,
  showClickBehaviorSidebar,
  onUpdateVisualizationSettings,
  onReplaceAllDashCardVisualizationSettings,
  autoScroll,
  className,
  onEditVisualization,
}: DashCardProps) {
  const {
    dashboard,
    slowCards,
    isEditing,
    isEditingParameter,
    navigateToNewCardFromDashboard,
    reportAutoScrolledToDashcard,
    isGuestEmbed,
  } = useDashboardContext();

  const dashcardData = useSelector((state) =>
    getDashcardData(state, dashcard.id),
  );
  const store = useStore();
  const dispatch = useDispatch();
  const getHref = useCallback(
    () => getDashcardHref(store.getState(), dashcard.id),
    [store, dashcard.id],
  );
  const [isPreviewingCard, setIsPreviewingCard] = useState(!dashcard.justAdded);
  const cardRootRef = useRef<HTMLDivElement>(null);

  const handlePreviewToggle = useCallback(() => {
    setIsPreviewingCard((wasPreviewingCard) => !wasPreviewingCard);
  }, []);

  useMount(() => {
    if (dashcard.justAdded) {
      cardRootRef?.current?.scrollIntoView({ block: "nearest" });
      markNewCardSeen(dashcard.id);
    }

    if (autoScroll) {
      cardRootRef?.current?.scrollIntoView({ block: "nearest" });
      reportAutoScrolledToDashcard?.();
    }
  });

  useUpdateEffect(() => {
    if (!isEditing) {
      setIsPreviewingCard(true);
    }
  }, [isEditing]);

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
    return cards.map((card) => {
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

  const { expectedDuration, isSlow } = useMemo(() => {
    const expectedDuration = Math.max(
      ...series.map((s) => s.card.query_average_duration || 0),
    );
    const isUsuallyFast = series.every((s) => s.isUsuallyFast);
    let isSlow: CardSlownessStatus = false;
    if (isLoading && series.some((s) => s.isSlow)) {
      isSlow = isUsuallyFast ? "usually-fast" : "usually-slow";
    }
    return { expectedDuration, isSlow };
  }, [series, isLoading]);

  const error = useMemo(
    () => getDashcardResultsError(series, !!isGuestEmbed),
    [series, isGuestEmbed],
  );
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
      authority_level: dashboard?.collection_authority_level,
    });
    const authorityLevel = dashcard.collection_authority_level;
    if (isRegularDashboard && !isRegularQuestion && authorityLevel) {
      const opts = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[authorityLevel];
      const iconSize = 16;
      return {
        name: opts.icon,
        color: opts.color,
        tooltip: opts.tooltips?.belonging,
        size: iconSize,

        // Workaround: headerIcon on cards in a first column have incorrect offset out of the box
        targetOffsetX: dashcard.col === 0 ? iconSize : 0,
      };
    }
  }, [dashcard, dashboard?.collection_authority_level]);

  const { supportPreviewing } = getVisualizationRaw(series) ?? {};
  const isEditingCardContent = supportPreviewing && !isPreviewingCard;

  const isEditingDashboardLayout =
    isEditing &&
    !clickBehaviorSidebarDashcard &&
    !isEditingParameter &&
    !isEditingCardContent;

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

  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const handleAddParameter = useCallback(
    (options: NewParameterOpts) => {
      dispatch(addParameter({ options, dashcardId: dashcard.id }));
    },
    [dashcard.id, dispatch],
  );

  const handleDuplicateDashcard = useCallback(() => {
    dispatch(duplicateCard({ id: dashcard.id }));
  }, [dashcard.id, dispatch]);

  const getVisualizerInitialState = useCallback(() => {
    if (isVisualizerDashboardCard(dashcard)) {
      return getInitialStateForVisualizerCard(dashcard, datasets);
    } else if (series.length > 1) {
      return getInitialStateForMultipleSeries(series);
    } else {
      return getInitialStateForCardDataSource(series[0].card, series[0]);
    }
  }, [dashcard, datasets, series]);

  const onEditVisualizationClick = useCallback(() => {
    const initialState = getVisualizerInitialState();

    onEditVisualization(dashcard, initialState);
  }, [dashcard, onEditVisualization, getVisualizerInitialState]);

  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);

  return (
    <ErrorBoundary>
      <Box
        data-testid="dashcard"
        data-dashcard-key={dashcard.id}
        className={cx(
          S.DashboardCardRoot,
          S.DashCardRoot,
          DashboardS.Card,
          EmbedFrameS.Card,
          CS.relative,
          CS.roundedSm,
          !isAction && CS.bordered,
          CS.flex,
          CS.flexColumn,
          CS.hoverParent,
          CS.hoverVisibility,
          {
            [S.hasHiddenBackground]: hasHiddenBackground,
            [S.shouldForceHiddenBackground]: shouldForceHiddenBackground,
            [S.isEmbeddingSdk]: isEmbeddingSdk(),
          },
          className,
        )}
        style={(theme) => {
          const { border } = theme.other.dashboard.card;
          if (border) {
            return { border };
          }
        }}
        ref={cardRootRef}
      >
        {isEditingDashboardLayout && (
          <DashCardActionsPanel
            className={S.DashCardActionsPanel}
            onMouseDown={preventDragging}
            onLeftEdge={dashcard.col === 0}
            series={series}
            dashcard={dashcard}
            question={question}
            isLoading={isLoading}
            isPreviewing={isPreviewingCard}
            hasError={hasError}
            onDuplicate={handleDuplicateDashcard}
            onRemove={onRemove}
            onReplaceCard={onReplaceCard}
            onUpdateVisualizationSettings={onUpdateVisualizationSettings}
            onReplaceAllDashCardVisualizationSettings={
              onReplaceAllDashCardVisualizationSettings
            }
            showClickBehaviorSidebar={handleShowClickBehaviorSidebar}
            onPreviewToggle={handlePreviewToggle}
            isTrashedOnRemove={isTrashedOnRemove}
            onAddParameter={handleAddParameter}
            onEditVisualization={onEditVisualizationClick}
          />
        )}
        <DashCardVisualization
          dashcard={dashcard}
          question={question}
          metadata={metadata}
          series={series}
          gridSize={gridSize}
          gridItemWidth={gridItemWidth}
          totalNumGridCols={totalNumGridCols}
          headerIcon={headerIcon}
          expectedDuration={expectedDuration}
          error={error}
          getHref={navigateToNewCardFromDashboard ? getHref : undefined}
          isAction={isAction}
          isEditingDashCardClickBehavior={isEditingDashCardClickBehavior}
          isEditingDashboardLayout={isEditingDashboardLayout}
          isClickBehaviorSidebarOpen={isClickBehaviorSidebarOpen}
          isSlow={isSlow}
          isPreviewing={isPreviewingCard}
          isMobile={isMobile}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onChangeCardAndRun={
            navigateToNewCardFromDashboard ? changeCardAndRunHandler : null
          }
          onTogglePreviewing={handlePreviewToggle}
          onEditVisualization={
            isVisualizerDashboardCard(dashcard)
              ? onEditVisualizationClick
              : undefined
          }
        />
      </Box>
    </ErrorBoundary>
  );
}

export const DashCard = memo(DashCardInner);
