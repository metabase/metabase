import cx from "classnames";
import type { ComponentType, ForwardedRef } from "react";
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
import { push } from "react-router-redux";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { getVisibleCardIds } from "metabase/dashboard/utils";
import {
  GRID_ASPECT_RATIO,
  GRID_WIDTH,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Flex } from "metabase/ui";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type {
  BaseDashboardCard,
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardTabId,
  QuestionDashboardCard,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { SetDashCardAttributesOpts } from "../../actions";
import {
  fetchCardData,
  markNewCardSeen,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  removeCardFromDashboard,
  replaceCard,
  setDashCardAttributes,
  setMultipleDashCardAttributes,
  showClickBehaviorSidebar,
  trashDashboardQuestion,
  undoRemoveCardFromDashboard,
} from "../../actions";
import {
  getInitialCardSizes,
  getLayoutForDashCard,
  getLayouts,
  getVisibleCards,
} from "../../grid-utils";
import { getDashcardDataMap } from "../../selectors";
import { FIXED_WIDTH } from "../Dashboard/DashboardComponents";

import { AddSeriesModalWrapper } from "./AddSeriesModalWrapper";
import S from "./DashboardGrid.module.css";
import { DashboardGridRender } from "./DashboardGridRender";
import { ReplaceCardModal } from "./ReplaceCardModal";

export type GridBreakpoint = "desktop" | "mobile";

export type ExplicitSizeProps = {
  width: number;
  height: number;
};

export interface DashboardGridInnerState {
  visibleCardIds: Set<number>;
  initialCardSizes: { [key: string]: { w: number; h: number } };
  layouts: {
    desktop: ReactGridLayout.Layout[];
    mobile: ReactGridLayout.Layout[];
  };
  addSeriesModalDashCard: BaseDashboardCard | null;
  replaceCardModalDashCard: BaseDashboardCard | null;
  isDragging: boolean;
  isAnimationPaused: boolean;
  dashcardCountByCardId: Record<CardId, number>;
  _lastProps?: LastProps;
}

/** Props from the previous render to use for comparison in getDerivedStateFromProps */
type LastProps = {
  dashboard: Dashboard;
  isEditing: boolean;
  selectedTabId: DashboardTabId | null;
};

const mapStateToProps = (state: State) => ({
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
  undoRemoveCardFromDashboard,
  replaceCard,
  onChangeLocation: push,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  fetchCardData,
};
const connector = connect(mapStateToProps, mapDispatchToProps, null, {
  forwardRef: true,
});

type DashboardGridReduxProps = ConnectedProps<typeof connector>;

export type DashboardGridProps = {
  dashboard: Dashboard;
  selectedTabId: DashboardTabId | null;
  slowCards: Record<DashCardId, boolean>;
  isEditing?: boolean;
  isEditingParameter?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isXray?: boolean;
  isFullscreen?: boolean;
  isNightMode?: boolean;
  withCardTitle?: boolean;
  clickBehaviorSidebarDashcard: DashboardCard | null;
  getClickActionMode?: ClickActionModeGetter;
  // public dashboard passes it explicitly
  width?: number;
  // public or embedded dashboard passes it as noop
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  downloadsEnabled: boolean;
  autoScrollToDashcardId?: DashCardId;
  reportAutoScrolledToDashcard?: () => void;
};

type DashboardGridInnerProps = Required<DashboardGridProps> &
  DashboardGridReduxProps &
  ExplicitSizeProps & {
    forwardedRef?: ForwardedRef<HTMLDivElement>;
  };

export const DashboardGrid = forwardRef<
  HTMLDivElement,
  DashboardGridInnerProps
>(function _DashboardGridInner2(
  {
    isEditing = false,
    isEditingParameter = false,
    withCardTitle = true,
    isNightMode = false,
    width = 0,
    height = 0,
    dashboard,
    selectedTabId,
    clickBehaviorSidebarDashcard,
    autoScrollToDashcardId,
    reportAutoScrolledToDashcard,
    downloadsEnabled,
    slowCards,
    markNewCardSeen,
    isFullscreen,
    isXray,
    isPublicOrEmbedded,
    onUpdateDashCardVisualizationSettings,
    onReplaceAllDashCardVisualizationSettings,
    getClickActionMode,
    navigateToNewCardFromDashboard,
    onChangeLocation,
    showClickBehaviorSidebar,
  },
  ref,
) {
  const dashcardData = useSelector(getDashcardDataMap);
  const dispatch = useDispatch();
  const contentViewportElement = useContext(ContentViewportContext);
  const initialVisibleIds = useMemo(
    () => getVisibleCardIds(dashboard.dashcards, dashcardData),
    [dashboard.dashcards, dashcardData],
  );

  const initialSizes = useMemo(
    () => getInitialCardSizes(dashboard.dashcards, undefined),
    [dashboard.dashcards],
  ); // Depends on initial props

  const [visibleCardIds, setVisibleCardIds] =
    useState<Set<DashCardId>>(initialVisibleIds);

  const getDashcardCountByCardId = (cards: BaseDashboardCard[]) =>
    _.countBy(cards, "card_id");

  const [dashcardCountByCardId, setDashcardCountByCardId] = useState<
    Record<CardId, number>
  >(() => getDashcardCountByCardId(dashboard.dashcards));

  const [initialCardSizes, setInitialCardSizes] =
    useState<Record<string, any>>(initialSizes);

  const [addSeriesModalDashCard, setAddSeriesModalDashCard] =
    useState<BaseDashboardCard | null>(null);

  const [replaceCardModalDashCard, setReplaceCardModalDashCard] =
    useState<BaseDashboardCard | null>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [isAnimationPaused, setIsAnimationPaused] = useState<boolean>(true);

  const pauseAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const onDashCardRemove = (dc: DashboardCard) => {
    dispatch(
      removeCardFromDashboard({
        dashcardId: dc.id,
        cardId: dc.card_id,
      }),
    );

    dispatch(
      addUndo({
        message: getIsLastDashboardQuestionDashcard(dc)
          ? t`Trashed and removed card`
          : t`Removed card`,
        undo: true,
        action: () =>
          dispatch(undoRemoveCardFromDashboard({ dashcardId: dc.id })),
      }),
    );
  };

  const onDashCardAddSeries = (dc: BaseDashboardCard) => {
    setAddSeriesModalDashCard(dc);
  };

  const onReplaceCard = (dashcard: BaseDashboardCard) => {
    setReplaceCardModalDashCard(dashcard);
  };

  useEffect(() => {
    pauseAnimationTimerRef.current = setTimeout(() => {
      setIsAnimationPaused(false);
    }, 0);

    return () => {
      if (pauseAnimationTimerRef.current !== null) {
        clearTimeout(pauseAnimationTimerRef.current);
      }
    };
  });

  useEffect(() => {
    const newCount = getDashcardCountByCardId(dashboard.dashcards);
    setDashcardCountByCardId(newCount);
  }, [dashboard.dashcards]);

  useEffect(() => {
    const nextVisibleCardIds = !isEditing
      ? getVisibleCardIds(dashboard.dashcards, dashcardData, visibleCardIds)
      : new Set(dashboard.dashcards.map((card) => card.id));

    if (!_.isEqual(nextVisibleCardIds, visibleCardIds)) {
      setVisibleCardIds(nextVisibleCardIds);
    }
  }, [isEditing, dashboard.dashcards, dashcardData, visibleCardIds]);

  const _getVisibleCards = useCallback(
    (
      cards = dashboard.dashcards,
      _visibleCardIds = visibleCardIds,
      _isEditing = isEditing,
      _selectedTabId = selectedTabId,
    ) => {
      return getVisibleCards(
        cards,
        _visibleCardIds,
        _isEditing ?? false,
        _selectedTabId,
      ) as DashboardCard[];
    },
    [dashboard.dashcards, isEditing, selectedTabId, visibleCardIds],
  );

  const visibleCards = useMemo(
    () =>
      _getVisibleCards(
        dashboard.dashcards,
        visibleCardIds,
        isEditing,
        selectedTabId,
      ),
    [
      _getVisibleCards,
      dashboard.dashcards,
      isEditing,
      selectedTabId,
      visibleCardIds,
    ],
  );

  // --- initialCardSizes Effect ---
  const prevVisibleCards = usePrevious(visibleCards);
  useEffect(() => {
    const hasVisibleDashcardsChanged = !_.isEqual(
      visibleCards,
      prevVisibleCards,
    );
    let nextInitialCardSizes = initialCardSizes;
    if (!isEditing || hasVisibleDashcardsChanged) {
      // Use direct variable
      nextInitialCardSizes = getInitialCardSizes(
        visibleCards,
        initialCardSizes,
      );
    }
    if (!_.isEqual(nextInitialCardSizes, initialCardSizes)) {
      setInitialCardSizes(nextInitialCardSizes);
    }
  }, [
    isEditing, // Direct variable
    visibleCards,
    prevVisibleCards,
    initialCardSizes,
    setInitialCardSizes,
  ]);

  // --- layouts Memo ---
  const layouts = useMemo(() => {
    return getLayouts(visibleCards, initialCardSizes);
  }, [visibleCards, initialCardSizes]);

  useEffect(() => {
    const nextVisibleCardIds = !isEditing
      ? getVisibleCardIds(dashboard.dashcards, dashcardData, visibleCardIds) // Pass current state here
      : new Set(dashboard.dashcards.map((card) => card.id));

    // Prevent infinite loops if the value hasn't actually changed
    if (!_.isEqual(nextVisibleCardIds, visibleCardIds)) {
      setVisibleCardIds(nextVisibleCardIds);
    }
    // Dependencies: Everything read inside the effect
  }, [isEditing, dashboard.dashcards, dashcardData, visibleCardIds]); // <-- Correct dependencies for this calculation

  const onLayoutChange = ({
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
      const dashboardCard = _getVisibleCards().find(
        (card) => String(card.id) === layoutItem.i,
      );
      if (dashboardCard) {
        const keys = ["h", "w", "x", "y"];
        const changed = !_.isEqual(
          _.pick(layoutItem, keys),
          _.pick(_getLayoutForDashCard(dashboardCard), keys),
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
      dispatch(setMultipleDashCardAttributes({ dashcards: changes }));
    }
  };

  const _getLayoutForDashCard = (dashcard: BaseDashboardCard) => {
    return getLayoutForDashCard(dashcard, initialCardSizes);
  };

  const getIsLastDashboardQuestionDashcard = (
    dc: BaseDashboardCard,
  ): boolean => {
    return Boolean(
      dc.card.dashboard_id !== null &&
        dc.card_id &&
        dashcardCountByCardId[dc.card_id] <= 1,
    );
  };

  const rowHeight = useMemo(() => {
    const hasScroll =
      contentViewportElement?.clientHeight <
      contentViewportElement?.scrollHeight;

    const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
    const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

    // prevent infinite re-rendering when the scroll bar appears/disappears
    // https://github.com/metabase/metabase/issues/17229
    return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
  }, [
    contentViewportElement?.clientHeight,
    contentViewportElement?.scrollHeight,
    width,
  ]);

  // we need to track whether or not we're dragging so we can disable pointer events on action buttons :-/
  const onDrag = () => {
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const onDragStop = () => {
    setIsDragging(false);
  };

  const isEditingLayout = useMemo(() => {
    return Boolean(
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null,
    );
  }, [clickBehaviorSidebarDashcard, isEditing, isEditingParameter]);

  return (
    <Flex
      align="center"
      justify="center"
      ref={ref}
      className={cx(S.DashboardGridContainer, {
        [S.isFixedWidth]: dashboard?.width === "fixed",
      })}
      data-testid="dashboard-grid"
      style={{
        "--dashboard-fixed-width": FIXED_WIDTH,
      }}
    >
      {/* {width > 0 ? this.renderGrid() : <div />} */}
      {width > 0 && (
        <DashboardGridRender
          width={width}
          height={height}
          layouts={layouts}
          rowHeight={rowHeight}
          isEditingLayout={isEditingLayout}
          isDragging={isDragging}
          onLayoutChange={onLayoutChange}
          onDrag={onDrag}
          onDragStop={onDragStop}
          visibleCards={visibleCards}
          isEditing={isEditing}
          autoScrollToDashcardId={autoScrollToDashcardId}
          reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
          downloadsEnabled={downloadsEnabled}
          isAnimationPaused={isAnimationPaused}
          slowCards={slowCards}
          markNewCardSeen={markNewCardSeen}
          isEditingParameter={isEditingParameter}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          isPublicOrEmbedded={isPublicOrEmbedded}
          isXray={isXray}
          withCardTitle={withCardTitle}
          onUpdateDashCardVisualizationSettings={
            onUpdateDashCardVisualizationSettings
          }
          onReplaceAllDashCardVisualizationSettings={
            onReplaceAllDashCardVisualizationSettings
          }
          getClickActionMode={getClickActionMode}
          navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
          onChangeLocation={onChangeLocation}
          dashboard={dashboard}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
          onDashCardRemove={onDashCardRemove}
          onDashCardAddSeries={onDashCardAddSeries}
          onReplaceCard={onReplaceCard}
          getIsLastDashboardQuestionDashcard={
            getIsLastDashboardQuestionDashcard
          }
        />
      )}
      <AddSeriesModalWrapper
        addSeriesModalDashCard={addSeriesModalDashCard}
        dashcardData={dashcardData}
        fetchCardData={(
          card: Card,
          dashcard: QuestionDashboardCard,
          options: {
            clearCache?: boolean;
            ignoreCache?: boolean;
            reload?: boolean;
          },
        ) => dispatch(fetchCardData(card, dashcard, options))}
        setDashCardAttributes={(options: {
          id: DashCardId;
          attributes: Partial<QuestionDashboardCard>;
        }) => dispatch(setDashCardAttributes(options))}
        setAddSeriesModalDashCard={(val) => setAddSeriesModalDashCard(val)}
      />
      <ReplaceCardModal
        dashboard={dashboard}
        replaceCardModalDashCard={replaceCardModalDashCard}
        setReplaceCardModalDashCard={(val) => setReplaceCardModalDashCard(val)}
      />
    </Flex>
  );
});

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connector,
)(DashboardGrid) as ComponentType<DashboardGridProps>;
