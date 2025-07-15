import cx from "classnames";
import type { ComponentType, ForwardedRef } from "react";
import { Component, forwardRef } from "react";
import type { ConnectedProps } from "react-redux";
import { push } from "react-router-redux";
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
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
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
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import { addUndo } from "metabase/redux/undo";
import { Box, Flex } from "metabase/ui";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import {
  isVisualizerDashboardCard,
  isVisualizerSupportedVisualization,
} from "metabase/visualizer/utils";
import type {
  BaseDashboardCard,
  Card,
  CardId,
  DashCardId,
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
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  removeCardFromDashboard,
  replaceCard,
  replaceCardWithVisualization,
  setDashCardAttributes,
  setMultipleDashCardAttributes,
  showClickBehaviorSidebar,
  trashDashboardQuestion,
  undoRemoveCardFromDashboard,
} from "../actions";
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

interface DashboardGridInnerState {
  visibleCardIds: Set<number>;
  initialCardSizes: { [key: string]: { w: number; h: number } };
  layouts: {
    desktop: ReactGridLayout.Layout[];
    mobile: ReactGridLayout.Layout[];
  };
  replaceCardModalDashCard: BaseDashboardCard | null;
  isDragging: boolean;
  isAnimationPaused: boolean;
  dashcardCountByCardId: Record<CardId, number>;
  _lastProps?: LastProps;

  visualizerModalStatus?: {
    dashcardId: number;
    state: VisualizerVizDefinition;
  };
}

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
  undoRemoveCardFromDashboard,
  replaceCard,
  onChangeLocation: push,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  fetchCardData,
  replaceCardWithVisualization,
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
  clickBehaviorSidebarDashcard: DashboardCard | null;
  getClickActionMode?: ClickActionModeGetter;
  // public dashboard passes it explicitly
  width?: number;
  // public or embedded dashboard passes it as noop
  navigateToNewCardFromDashboard:
    | ((opts: NavigateToNewCardFromDashboardOpts) => void)
    | null;
  downloadsEnabled: EmbedResourceDownloadOptions;
  autoScrollToDashcardId?: DashCardId;
  reportAutoScrolledToDashcard?: () => void;
  handleSetEditing?: (dashboard: Dashboard | null) => void;
};

type DashboardGridInnerProps = Required<DashboardGridProps> &
  DashboardGridReduxProps &
  ExplicitSizeProps & {
    forwardedRef?: ForwardedRef<HTMLDivElement>;
  };

class DashboardGridInner extends Component<
  DashboardGridInnerProps,
  DashboardGridInnerState
> {
  static contextType = ContentViewportContext;

  _pauseAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: DashboardGridInnerProps, context: unknown) {
    super(props, context);

    const visibleCardIds = getVisibleCardIds(
      props.dashboard.dashcards,
      props.dashcardData,
    );

    const initialCardSizes = getInitialCardSizes(
      props.dashboard.dashcards,
      this.state?.initialCardSizes,
    );

    this.state = {
      visibleCardIds,
      dashcardCountByCardId: this.getDashcardCountByCardId(
        props.dashboard.dashcards,
      ),
      initialCardSizes,
      layouts: getLayouts(
        props.dashboard.dashcards,
        this.state?.initialCardSizes,
      ),
      replaceCardModalDashCard: null,
      isDragging: false,
      isAnimationPaused: true,
      _lastProps: {
        dashboard: props.dashboard,
        isEditing: props.isEditing,
        selectedTabId: props.selectedTabId,
      },
    };
  }

  componentDidMount() {
    // In order to skip the initial cards animation we must let the grid layout calculate
    // the initial card positions. The timer is necessary to enable animation only
    // after the grid layout has been calculated and applied to the DOM.
    this._pauseAnimationTimer = setTimeout(() => {
      this.setState({ isAnimationPaused: false });
    }, 0);
  }

  componentWillUnmount() {
    if (this._pauseAnimationTimer !== null) {
      clearTimeout(this._pauseAnimationTimer);
    }
  }

  componentDidUpdate(prevProps: DashboardGridInnerProps) {
    if (prevProps.dashboard.dashcards !== this.props.dashboard.dashcards) {
      this.setState({
        dashcardCountByCardId: this.getDashcardCountByCardId(
          this.props.dashboard.dashcards,
        ),
      });
    }
  }

  static getDerivedStateFromProps(
    nextProps: DashboardGridInnerProps,
    state: DashboardGridInnerState,
  ): Partial<DashboardGridInnerState> {
    const { dashboard, dashcardData, isEditing, selectedTabId } = nextProps;
    const lastProps = state._lastProps;

    const visibleCardIds = !isEditing
      ? getVisibleCardIds(
          dashboard.dashcards,
          dashcardData,
          state.visibleCardIds,
        )
      : new Set(dashboard.dashcards.map((card) => card.id));

    const visibleCards = getVisibleCards(
      dashboard.dashcards,
      visibleCardIds,
      isEditing,
      selectedTabId,
    );

    const lastVisibleCards = lastProps?.dashboard?.dashcards
      ? getVisibleCards(
          lastProps.dashboard.dashcards,
          state.visibleCardIds,
          lastProps.isEditing,
          lastProps.selectedTabId,
        )
      : [];

    const hasVisibleDashcardsChanged = !_.isEqual(
      visibleCards,
      lastVisibleCards,
    );

    const initialCardSizes =
      !isEditing || hasVisibleDashcardsChanged
        ? getInitialCardSizes(visibleCards, state.initialCardSizes)
        : state.initialCardSizes;

    return {
      visibleCardIds,
      initialCardSizes,
      layouts: getLayouts(visibleCards, state.initialCardSizes),
      _lastProps: {
        dashboard,
        isEditing,
        selectedTabId,
      },
    };
  }

  onLayoutChange = ({
    layout,
    breakpoint,
  }: {
    layout: ReactGridLayout.Layout[];
    breakpoint: GridBreakpoint;
  }) => {
    const { setMultipleDashCardAttributes, isEditing } = this.props;

    // We allow moving and resizing cards only on the desktop
    // Ensures onLayoutChange triggered by window resize,
    // won't break the main layout
    if (!isEditing || breakpoint !== "desktop") {
      return;
    }

    const changes: SetDashCardAttributesOpts[] = [];

    layout.forEach((layoutItem) => {
      const dashboardCard = this.getVisibleCards().find(
        (card) => String(card.id) === layoutItem.i,
      );
      if (dashboardCard) {
        const keys = ["h", "w", "x", "y"];
        const changed = !_.isEqual(
          _.pick(layoutItem, keys),
          _.pick(this.getLayoutForDashCard(dashboardCard), keys),
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
  };

  getLayoutForDashCard = (dashcard: BaseDashboardCard) => {
    return getLayoutForDashCard(dashcard, this.state?.initialCardSizes);
  };

  getVisibleCards = (
    cards = this.props.dashboard.dashcards,
    visibleCardIds = this.state.visibleCardIds,
    isEditing = this.props.isEditing,
    selectedTabId = this.props.selectedTabId,
  ) => {
    return getVisibleCards(
      cards,
      visibleCardIds,
      isEditing,
      selectedTabId,
    ) as DashboardCard[];
  };

  getDashcardCountByCardId = (cards: BaseDashboardCard[]) =>
    _.countBy(cards, "card_id");

  getIsLastDashboardQuestionDashcard = (dc: BaseDashboardCard): boolean => {
    return Boolean(
      dc.card.dashboard_id !== null &&
        dc.card_id &&
        this.state.dashcardCountByCardId[dc.card_id] <= 1,
    );
  };

  getRowHeight() {
    const { width } = this.props;

    const contentViewportElement = this.context as any;
    const hasScroll =
      contentViewportElement?.clientHeight <
      contentViewportElement?.scrollHeight;

    const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
    const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

    // prevent infinite re-rendering when the scroll bar appears/disappears
    // https://github.com/metabase/metabase/issues/17229
    return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
  }

  renderReplaceCardModal() {
    const { addUndo, replaceCard, setDashCardAttributes, dashboard } =
      this.props;
    const { replaceCardModalDashCard } = this.state;

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
          if (item.dashboard.id !== dashboard.id) {
            return false;
          }
        }
        return true;
      });
    };

    const handleClose = () => {
      this.setState({ replaceCardModalDashCard: null });
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
  }

  // we need to track whether or not we're dragging so we can disable pointer events on action buttons :-/
  onDrag = () => {
    if (!this.state.isDragging) {
      this.setState({ isDragging: true });
    }
  };

  onDragStop = () => {
    this.setState({ isDragging: false });
  };

  onDashCardRemove = (dc: DashboardCard) => {
    this.props.removeCardFromDashboard({
      dashcardId: dc.id,
      cardId: dc.card_id,
    });

    this.props.addUndo({
      message: this.getIsLastDashboardQuestionDashcard(dc)
        ? t`Trashed and removed card`
        : t`Removed card`,
      undo: true,
      action: () =>
        this.props.undoRemoveCardFromDashboard({ dashcardId: dc.id }),
    });
  };

  onReplaceCard = (dashcard: BaseDashboardCard) => {
    this.setState({ replaceCardModalDashCard: dashcard });
  };

  onEditVisualization = (
    dashcard: BaseDashboardCard,
    initialState: VisualizerVizDefinition,
  ) => {
    this.setState({
      visualizerModalStatus: {
        dashcardId: dashcard.id,
        state: initialState,
      },
    });

    this.handleSetEditing();
  };

  renderDashCard(
    dashcard: DashboardCard,
    {
      isMobile,
      gridItemWidth,
      totalNumGridCols,
      downloadsEnabled,
      shouldAutoScrollTo,
      reportAutoScrolledToDashcard,
    }: {
      isMobile: boolean;
      gridItemWidth: number;
      totalNumGridCols: number;
      downloadsEnabled: EmbedResourceDownloadOptions;
      shouldAutoScrollTo: boolean;
      reportAutoScrolledToDashcard?: () => void;
    },
  ) {
    return (
      <DashCard
        className={S.Card}
        dashcard={dashcard}
        slowCards={this.props.slowCards}
        gridItemWidth={gridItemWidth}
        totalNumGridCols={totalNumGridCols}
        markNewCardSeen={this.props.markNewCardSeen}
        isEditing={this.props.isEditing}
        isEditingParameter={this.props.isEditingParameter}
        isFullscreen={this.props.isFullscreen}
        isNightMode={this.props.isNightMode}
        isMobile={isMobile}
        isPublicOrEmbedded={this.props.isPublicOrEmbedded}
        isXray={this.props.isXray}
        onRemove={this.onDashCardRemove}
        onReplaceCard={this.onReplaceCard}
        onUpdateVisualizationSettings={
          this.props.onUpdateDashCardVisualizationSettings
        }
        onReplaceAllDashCardVisualizationSettings={
          this.props.onReplaceAllDashCardVisualizationSettings
        }
        getClickActionMode={this.props.getClickActionMode}
        navigateToNewCardFromDashboard={
          this.props.navigateToNewCardFromDashboard
        }
        onChangeLocation={this.props.onChangeLocation}
        dashboard={this.props.dashboard}
        showClickBehaviorSidebar={this.props.showClickBehaviorSidebar}
        clickBehaviorSidebarDashcard={this.props.clickBehaviorSidebarDashcard}
        downloadsEnabled={downloadsEnabled}
        autoScroll={shouldAutoScrollTo}
        isTrashedOnRemove={this.getIsLastDashboardQuestionDashcard(dashcard)}
        reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
        onEditVisualization={this.onEditVisualization}
      />
    );
  }

  onVisualizerModalSave = (visualization: VisualizerVizDefinition) => {
    const { visualizerModalStatus } = this.state;

    if (!visualizerModalStatus) {
      return;
    }

    this.props.replaceCardWithVisualization({
      dashcardId: visualizerModalStatus.dashcardId,
      visualization,
    });

    this.onVisualizerModalClose();
  };

  onVisualizerModalClose = () => {
    this.setState({ visualizerModalStatus: undefined });
  };

  renderVisualizerModal() {
    const { dashcards } = this.props;
    const { visualizerModalStatus } = this.state;
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
        onSave={this.onVisualizerModalSave}
        onClose={this.onVisualizerModalClose}
        initialState={{ state: visualizerModalStatus.state }}
        saveLabel={t`Save`}
        allowSaveWhenPristine={allowSaveWhenPristine}
      />
    );
  }

  handleSetEditing = () => {
    this.props.handleSetEditing?.(this.props.dashboard);
  };

  get isEditingLayout() {
    const { isEditing, isEditingParameter, clickBehaviorSidebarDashcard } =
      this.props;
    return Boolean(
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null,
    );
  }

  renderGridItem = ({
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
    const { isEditing, autoScrollToDashcardId, reportAutoScrolledToDashcard } =
      this.props;
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
            [S.isAnimationDisabled]: this.state.isAnimationPaused,
          },
        )}
      >
        {this.renderDashCard(dc, {
          isMobile: breakpoint === "mobile",
          gridItemWidth,
          totalNumGridCols,
          downloadsEnabled: this.props.downloadsEnabled,
          shouldAutoScrollTo,
          reportAutoScrolledToDashcard,
        })}
      </Box>
    );
  };

  renderGrid() {
    const { width } = this.props;
    const { layouts, visualizerModalStatus } = this.state;
    const rowHeight = this.getRowHeight();

    return (
      <GridLayout<DashboardCard>
        className={cx({
          [DashboardS.DashEditing]: this.isEditingLayout,
          [DashboardS.Mobile]: width < GRID_BREAKPOINTS.mobile,
          [DashboardS.DashDragging]: this.state.isDragging,
          // we use this class to hide a dashcard actions
          // panel during dragging
          [DashCardS.DashboardCardRootDragging]: this.state.isDragging,
        })}
        layouts={layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLUMNS}
        width={width}
        margin={{ desktop: [6, 6], mobile: [6, 10] }}
        containerPadding={[0, 0]}
        rowHeight={rowHeight}
        onLayoutChange={this.onLayoutChange}
        onDrag={this.onDrag}
        onDragStop={this.onDragStop}
        isEditing={this.isEditingLayout && !visualizerModalStatus}
        compactType="vertical"
        items={this.getVisibleCards()}
        itemRenderer={this.renderGridItem}
      />
    );
  }

  render() {
    const { dashboard, width, forwardedRef } = this.props;
    return (
      <Flex
        align="center"
        justify="center"
        className={cx(S.DashboardGridContainer, {
          [S.isFixedWidth]: dashboard?.width === "fixed",
        })}
        ref={forwardedRef}
        data-testid="dashboard-grid"
        style={{
          "--dashboard-fixed-width": FIXED_WIDTH,
        }}
      >
        {width > 0 ? this.renderGrid() : <div />}
        {this.renderReplaceCardModal()}
        {this.renderVisualizerModal()}
      </Flex>
    );
  }
}

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

const DashboardGrid = forwardRef<HTMLDivElement, DashboardGridInnerProps>(
  function _DashboardGrid(
    {
      isEditing = false,
      isEditingParameter = false,
      isNightMode = false,
      width = 0,
      ...restProps
    },
    ref,
  ) {
    return (
      <DashboardGridInner
        width={width}
        isEditing={isEditing}
        isEditingParameter={isEditingParameter}
        isNightMode={isNightMode}
        {...restProps}
        forwardedRef={ref}
      />
    );
  },
);

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connector,
)(DashboardGrid) as ComponentType<DashboardGridProps>;
