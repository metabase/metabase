import cx from "classnames";
import type { ComponentType } from "react";
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ConnectedProps } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/common/components/ExplicitSize";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  getVisibleCardIds,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import {
  GRID_ASPECT_RATIO,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  GRID_WIDTH,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";
import { connect } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { addUndo } from "metabase/redux/undo";
import { Box, Flex, type FlexProps } from "metabase/ui";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import {
  isVisualizerDashboardCard,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";
import type {
  BaseDashboardCard,
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  DashboardTabId,
  RecentItem,
  VisualizerVizDefinition,
} from "metabase-types/api";
import { isRecentCollectionItem } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { SetDashCardAttributesOpts } from "../actions";
import {
  fetchCardData,
  markNewCardSeen,
  removeCardFromDashboard,
  replaceCard,
  replaceCardWithVisualization,
  setDashCardAttributes,
  setMultipleDashCardAttributes,
  showClickBehaviorSidebar,
  trashDashboardQuestion,
} from "../actions";
import { useDashboardContext } from "../context";
import {
  getInitialCardSizes,
  getLayoutForDashCard,
  getLayouts,
  getVisibleCards,
} from "../grid-utils";
import { getDashcardDataMap, getDashcards } from "../selectors";

import { DashCard } from "./DashCard/DashCard";
import DashCardS from "./DashCard/DashCard.module.css";
import { FIXED_WIDTH } from "./Dashboard/DashboardComponents";
import S from "./DashboardGrid.module.css";
import { GridLayout } from "./grid/GridLayout";

type GridBreakpoint = "desktop" | "mobile";

type ExplicitSizeProps = {
  width: number;
};

/** Props from the previous render to use for comparison in getDerivedStateFromProps */
type LastProps = {
  dashboard: Dashboard;
  isEditing: boolean;
  selectedTabId: DashboardTabId | null;
};

const mapStateToProps = (state: State) => ({
  dashcards: getDashcards(state),
  dashcardData: getDashcardDataMap(state),
});

const mapDispatchToProps = {
  addUndo,
  removeCardFromDashboard,
  trashDashboardQuestion,
  showClickBehaviorSidebar,
  markNewCardSeen,
  setMultipleDashCardAttributes,
  setDashCardAttributes,
  replaceCard,
  fetchCardData,
  replaceCardWithVisualization,
};
const connector = connect(mapStateToProps, mapDispatchToProps, null, {
  forwardRef: true,
});

type DashboardGridReduxProps = ConnectedProps<typeof connector>;

export type DashboardGridProps = {
  // public dashboard passes it explicitly
  width?: number;
  handleSetEditing?: (dashboard: Dashboard | null) => void;
} & Pick<FlexProps, "className" | "style" | "p">;

type DashboardGridForwardedRefProps = Required<DashboardGridProps> &
  DashboardGridReduxProps &
  ExplicitSizeProps &
  Pick<FlexProps, "className" | "style" | "p">;

const DashboardGrid = forwardRef<
  HTMLDivElement,
  DashboardGridForwardedRefProps
>(function DashboardGrid({ width = 0, ...restProps }, ref) {
  // Get context values that were previously passed as props
  const {
    dashboard,
    selectedTabId,
    isEditing = false,
    isEditingParameter = false,
    clickBehaviorSidebarDashcard,
    autoScrollToDashcardId,
    onReplaceAllDashCardVisualizationSettings,
    onUpdateDashCardVisualizationSettings,
  } = useDashboardContext();

  // Get Redux props from restProps
  const {
    dashcards,
    dashcardData,
    addUndo,
    removeCardFromDashboard,
    showClickBehaviorSidebar,
    markNewCardSeen,
    setMultipleDashCardAttributes,
    setDashCardAttributes,
    replaceCard,
    replaceCardWithVisualization,
    handleSetEditing,
    className,
    style,
    p,
  } = restProps;

  const contentViewportContext = useContext(ContentViewportContext);
  const _pauseAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Initialize state using useState hooks
  const initialVisibleCardIds = useMemo(
    () =>
      dashboard
        ? getVisibleCardIds(dashboard.dashcards, dashcardData)
        : new Set<number>(),
    [dashboard, dashcardData],
  );

  const [visibleCardIds, setVisibleCardIds] = useState<Set<number>>(
    initialVisibleCardIds,
  );
  const [initialCardSizes, setInitialCardSizes] = useState<{
    [key: string]: { w: number; h: number };
  }>(() =>
    dashboard ? getInitialCardSizes(dashboard.dashcards, undefined) : {},
  );
  const [layouts, setLayouts] = useState<{
    desktop: ReactGridLayout.Layout[];
    mobile: ReactGridLayout.Layout[];
  }>(() =>
    dashboard
      ? getLayouts(dashboard.dashcards, undefined)
      : { desktop: [], mobile: [] },
  );
  const [replaceCardModalDashCard, setReplaceCardModalDashCard] =
    useState<BaseDashboardCard | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimationPaused, setIsAnimationPaused] = useState(true);
  const [dashcardCountByCardId, setDashcardCountByCardId] = useState<
    Record<CardId, number>
  >(() => (dashboard ? getDashcardCountByCardId(dashboard.dashcards) : {}));
  const [visualizerModalStatus, setVisualizerModalStatus] = useState<
    | {
        dashcardId: number;
        state: VisualizerVizDefinition;
      }
    | undefined
  >(undefined);

  // Use ref to track last props for comparison (replacement for _lastProps state)
  const lastPropsRef = useRef<LastProps>({
    dashboard: dashboard!,
    isEditing,
    selectedTabId,
  });

  // Helper function for counting dashcards by card ID
  const getDashcardCountByCardId = useCallback(
    (cards: BaseDashboardCard[]) => _.countBy(cards, "card_id"),
    [],
  );

  // Convert componentDidMount and componentWillUnmount to useEffect
  useEffect(() => {
    // In order to skip the initial cards animation we must let the grid layout calculate
    // the initial card positions. The timer is necessary to enable animation only
    // after the grid layout has been calculated and applied to the DOM.
    _pauseAnimationTimerRef.current = setTimeout(() => {
      setIsAnimationPaused(false);
    }, 0);

    return () => {
      if (_pauseAnimationTimerRef.current !== null) {
        clearTimeout(_pauseAnimationTimerRef.current);
      }
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Convert componentDidUpdate to useEffect
  useEffect(() => {
    if (dashboard) {
      setDashcardCountByCardId(getDashcardCountByCardId(dashboard.dashcards));
    }
  }, [dashboard, getDashcardCountByCardId]);

  // Convert getDerivedStateFromProps logic to useEffect hooks
  useEffect(() => {
    if (!dashboard) {
      return;
    }

    const newVisibleCardIds = !isEditing
      ? getVisibleCardIds(dashboard.dashcards, dashcardData, visibleCardIds)
      : new Set(dashboard.dashcards.map((card: DashboardCard) => card.id));

    const visibleCards = getVisibleCards(
      dashboard.dashcards,
      newVisibleCardIds,
      isEditing,
      selectedTabId,
    );

    const lastVisibleCards = lastPropsRef.current?.dashboard?.dashcards
      ? getVisibleCards(
          lastPropsRef.current.dashboard.dashcards,
          visibleCardIds,
          lastPropsRef.current.isEditing,
          lastPropsRef.current.selectedTabId,
        )
      : [];

    const hasVisibleDashcardsChanged = !_.isEqual(
      visibleCards,
      lastVisibleCards,
    );

    const newInitialCardSizes =
      !isEditing || hasVisibleDashcardsChanged
        ? getInitialCardSizes(visibleCards, initialCardSizes)
        : initialCardSizes;

    // Update state if there are changes
    if (!_.isEqual(newVisibleCardIds, visibleCardIds)) {
      setVisibleCardIds(newVisibleCardIds);
    }

    if (!_.isEqual(newInitialCardSizes, initialCardSizes)) {
      setInitialCardSizes(newInitialCardSizes);
    }

    setLayouts(getLayouts(visibleCards, initialCardSizes));

    // Update lastProps ref
    lastPropsRef.current = {
      dashboard,
      isEditing,
      selectedTabId,
    };
  }, [
    dashboard,
    dashcardData,
    isEditing,
    selectedTabId,
    visibleCardIds,
    initialCardSizes,
  ]);

  const getLayoutForDashCardFn = useCallback(
    (dashcard: BaseDashboardCard) => {
      return getLayoutForDashCard(dashcard, initialCardSizes);
    },
    [initialCardSizes],
  );

  const getVisibleCardsFn = useCallback(
    (
      cards = dashboard?.dashcards || [],
      cardIds = visibleCardIds,
      editing = isEditing,
      tabId = selectedTabId,
    ): DashboardCard[] => {
      return getVisibleCards(cards, cardIds, editing, tabId) as DashboardCard[];
    },
    [dashboard?.dashcards, visibleCardIds, isEditing, selectedTabId],
  );

  const onLayoutChange = useCallback(
    ({
      layout,
      breakpoint,
    }: {
      layout: ReactGridLayout.Layout[];
      breakpoint: GridBreakpoint;
    }) => {
      // We allow moving and resizing cards only on the desktop
      // Ensures onLayoutChange triggered by window resize,
      // won't break the main layout
      if (!isEditing || breakpoint !== "desktop") {
        return;
      }

      const changes: SetDashCardAttributesOpts[] = [];

      layout.forEach((layoutItem) => {
        const dashboardCard = getVisibleCardsFn().find(
          (card) => String(card.id) === layoutItem.i,
        );
        if (dashboardCard) {
          const keys = ["h", "w", "x", "y"];
          const changed = !_.isEqual(
            _.pick(layoutItem, keys),
            _.pick(getLayoutForDashCardFn(dashboardCard), keys),
          );

          if (changed) {
            changes.push({
              id: dashboardCard.id,
              attributes: {
                col: layoutItem.x,
                row: layoutItem.y,
                size_x: layoutItem.w,
                size_y: layoutItem.h,
              },
            });
          }
        }
      });

      if (changes.length > 0) {
        setMultipleDashCardAttributes({ dashcards: changes });
      }
    },
    [
      setMultipleDashCardAttributes,
      isEditing,
      getVisibleCardsFn,
      getLayoutForDashCardFn,
    ],
  );

  const getIsLastDashboardQuestionDashcard = useCallback(
    (dc: BaseDashboardCard): boolean => {
      return Boolean(
        dc.card.dashboard_id !== null &&
          dc.card_id &&
          dashcardCountByCardId[dc.card_id] <= 1,
      );
    },
    [dashcardCountByCardId],
  );

  const getRowHeight = useCallback(() => {
    const contentViewportElement = contentViewportContext as any;
    const hasScroll =
      contentViewportElement?.clientHeight <
      contentViewportElement?.scrollHeight;

    const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
    const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

    // prevent infinite re-rendering when the scroll bar appears/disappears
    // https://github.com/metabase/metabase/issues/17229
    return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
  }, [width, contentViewportContext]);

  const renderReplaceCardModal = useCallback(() => {
    const hasValidDashCard =
      !!replaceCardModalDashCard &&
      isQuestionDashCard(replaceCardModalDashCard);

    const handleSelect = (nextCard: QuestionPickerValueItem) => {
      if (!hasValidDashCard) {
        return;
      }

      replaceCard({
        dashcardId: replaceCardModalDashCard.id,
        nextCardId: nextCard.id,
      });

      addUndo({
        message: getUndoReplaceCardMessage(replaceCardModalDashCard.card),
        undo: true,
        action: () =>
          setDashCardAttributes({
            id: replaceCardModalDashCard.id,
            attributes: replaceCardModalDashCard,
          }),
      });
      handleClose();
    };

    const replaceCardModalRecentFilter = (items: RecentItem[]) => {
      return items.filter((item) => {
        if (isRecentCollectionItem(item) && item.dashboard) {
          if (item.dashboard.id !== dashboard?.id) {
            return false;
          }
        }
        return true;
      });
    };

    const handleClose = () => {
      setReplaceCardModalDashCard(null);
    };

    if (!hasValidDashCard) {
      return null;
    }

    return (
      <QuestionPickerModal
        title={t`Pick what you want to replace this with`}
        value={
          replaceCardModalDashCard.card.id
            ? getQuestionPickerValue(replaceCardModalDashCard.card)
            : undefined
        }
        models={["card", "dataset", "metric"]}
        onChange={handleSelect}
        onClose={handleClose}
        recentFilter={replaceCardModalRecentFilter}
      />
    );
  }, [
    addUndo,
    replaceCard,
    setDashCardAttributes,
    dashboard,
    replaceCardModalDashCard,
  ]);

  // Event handlers converted to useCallback
  const onDrag = useCallback(() => {
    if (!isDragging) {
      setIsDragging(true);
    }
  }, [isDragging]);

  const onDragStop = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onDashCardRemove = useCallback(
    (dc: DashboardCard) => {
      removeCardFromDashboard({
        dashcardId: dc.id,
        cardId: dc.card_id,
      });
    },
    [removeCardFromDashboard],
  );

  const onReplaceCard = useCallback((dashcard: BaseDashboardCard) => {
    setReplaceCardModalDashCard(dashcard);
  }, []);

  const handleSetEditingFn = useCallback(() => {
    handleSetEditing?.(dashboard);
  }, [handleSetEditing, dashboard]);

  const onEditVisualization = useCallback(
    (dashcard: BaseDashboardCard, initialState: VisualizerVizDefinition) => {
      setVisualizerModalStatus({
        dashcardId: dashcard.id,
        state: initialState,
      });

      handleSetEditingFn();
    },
    [handleSetEditingFn],
  );

  const renderDashCard = useCallback(
    (
      dashcard: DashboardCard,
      {
        isMobile,
        gridItemWidth,
        totalNumGridCols,
        shouldAutoScrollTo,
      }: {
        isMobile: boolean;
        gridItemWidth: number;
        totalNumGridCols: number;
        shouldAutoScrollTo: boolean;
      },
    ) => {
      return (
        <DashCard
          className={S.Card}
          dashcard={dashcard}
          gridItemWidth={gridItemWidth}
          totalNumGridCols={totalNumGridCols}
          markNewCardSeen={markNewCardSeen}
          isMobile={isMobile}
          onRemove={onDashCardRemove}
          onReplaceCard={onReplaceCard}
          onUpdateVisualizationSettings={onUpdateDashCardVisualizationSettings}
          onReplaceAllDashCardVisualizationSettings={
            onReplaceAllDashCardVisualizationSettings
          }
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
          isTrashedOnRemove={getIsLastDashboardQuestionDashcard(dashcard)}
          onEditVisualization={onEditVisualization}
          autoScroll={shouldAutoScrollTo}
        />
      );
    },
    [
      markNewCardSeen,
      onDashCardRemove,
      onReplaceCard,
      onUpdateDashCardVisualizationSettings,
      onReplaceAllDashCardVisualizationSettings,
      showClickBehaviorSidebar,
      clickBehaviorSidebarDashcard,
      getIsLastDashboardQuestionDashcard,
      onEditVisualization,
    ],
  );

  const onVisualizerModalClose = useCallback(() => {
    setVisualizerModalStatus(undefined);
  }, []);

  const onVisualizerModalSave = useCallback(
    (visualization: VisualizerVizDefinition) => {
      if (!visualizerModalStatus) {
        return;
      }

      replaceCardWithVisualization({
        dashcardId: visualizerModalStatus.dashcardId,
        visualization,
      });

      onVisualizerModalClose();
    },
    [
      visualizerModalStatus,
      replaceCardWithVisualization,
      onVisualizerModalClose,
    ],
  );

  const renderVisualizerModal = useCallback(() => {
    if (!visualizerModalStatus) {
      return null;
    }

    const dashcard = dashcards[visualizerModalStatus.dashcardId];

    // We want to allow saving a visualization as is if it's initial display type
    // isn't supported by visualizer. For example, taking a pivot table and saving
    // it as a bar chart with several columns selected.
    const allowSaveWhenPristine =
      !isVisualizerDashboardCard(dashcard) &&
      !isVisualizerSupportedVisualization(dashcard?.card.display);

    return (
      <VisualizerModal
        onSave={onVisualizerModalSave}
        onClose={onVisualizerModalClose}
        initialState={{ state: visualizerModalStatus.state }}
        saveLabel={t`Save`}
        allowSaveWhenPristine={allowSaveWhenPristine}
      />
    );
  }, [
    dashcards,
    visualizerModalStatus,
    onVisualizerModalSave,
    onVisualizerModalClose,
  ]);

  const isEditingLayout = useMemo(() => {
    return Boolean(
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null,
    );
  }, [isEditing, isEditingParameter, clickBehaviorSidebarDashcard]);

  const renderGridItem = useCallback(
    ({
      item: dc,
      breakpoint,
      gridItemWidth,
      totalNumGridCols,
    }: {
      item: DashboardCard;
      breakpoint: GridBreakpoint;
      gridItemWidth: number;
      totalNumGridCols: number;
    }) => {
      const shouldAutoScrollTo = autoScrollToDashcardId === dc.id;

      const shouldChangeResizeHandle = isEditingTextOrHeadingCard(
        dc.card.display,
        isEditing,
      );

      return (
        <Box
          key={String(dc.id)}
          data-testid="dashcard-container"
          className={cx(
            DashboardS.DashCard,
            EmbedFrameS.DashCard,
            LegendS.DashCard,
            S.DashboardCardContainer,
            {
              [DashboardS.BrandColorResizeHandle]: shouldChangeResizeHandle,
              [S.isAnimationDisabled]: isAnimationPaused,
            },
          )}
        >
          {renderDashCard(dc, {
            isMobile: breakpoint === "mobile",
            gridItemWidth,
            totalNumGridCols,
            shouldAutoScrollTo,
          })}
        </Box>
      );
    },
    [isEditing, autoScrollToDashcardId, isAnimationPaused, renderDashCard],
  );

  const renderGrid = useCallback(() => {
    const rowHeight = getRowHeight();

    return (
      <GridLayout<DashboardCard>
        className={cx({
          [DashboardS.DashEditing]: isEditingLayout,
          [DashboardS.Mobile]: width < GRID_BREAKPOINTS.mobile,
          [DashboardS.DashDragging]: isDragging,
          // we use this class to hide a dashcard actions
          // panel during dragging
          [DashCardS.DashboardCardRootDragging]: isDragging,
        })}
        layouts={layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLUMNS}
        width={width}
        margin={{ desktop: [6, 6], mobile: [6, 10] }}
        containerPadding={[0, 0]}
        rowHeight={rowHeight}
        onLayoutChange={onLayoutChange}
        onDrag={onDrag}
        onDragStop={onDragStop}
        isEditing={isEditingLayout && !visualizerModalStatus}
        compactType="vertical"
        items={getVisibleCardsFn()}
        itemRenderer={renderGridItem}
      />
    );
  }, [
    width,
    getRowHeight,
    isEditingLayout,
    isDragging,
    layouts,
    onLayoutChange,
    onDrag,
    onDragStop,
    visualizerModalStatus,
    getVisibleCardsFn,
    renderGridItem,
  ]);

  // Early return if no dashboard
  if (!dashboard) {
    return null;
  }

  // Main render return
  return (
    <Flex
      align="center"
      justify="center"
      className={cx(
        S.DashboardGridContainer,
        {
          [S.isFixedWidth]: dashboard?.width === "fixed",
        },
        className,
      )}
      ref={ref}
      data-testid="dashboard-grid"
      style={{
        "--dashboard-fixed-width": FIXED_WIDTH,
        ...style,
      }}
      p={p}
    >
      {width > 0 ? renderGrid() : <div />}
      {renderReplaceCardModal()}
      {renderVisualizerModal()}
    </Flex>
  );
});

function isEditingTextOrHeadingCard(display: string, isEditing: boolean) {
  const isTextOrHeadingCard = display === "heading" || display === "text";

  return isEditing && isTextOrHeadingCard;
}

const getUndoReplaceCardMessage = ({ type }: Card) => {
  if (type === "model") {
    return t`Model replaced`;
  }

  if (type === "metric") {
    return t`Metric replaced`;
  }

  if (type === "question") {
    return t`Question replaced`;
  }

  throw new Error(`Unknown card.type: ${type}`);
};

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connector,
)(DashboardGrid) as ComponentType<DashboardGridProps>;
