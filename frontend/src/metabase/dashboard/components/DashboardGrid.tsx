import cx from "classnames";
import type { LocationDescriptor } from "history";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import type { QuestionPickerValueItem } from "metabase/common/components/QuestionPicker";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import ModalS from "metabase/css/components/modal.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import {
  isQuestionDashCard,
  getVisibleCardIds,
} from "metabase/dashboard/utils";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import {
  GRID_WIDTH,
  GRID_ASPECT_RATIO,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  DEFAULT_CARD_SIZE,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { addUndo } from "metabase/redux/undo";
import { getVisualizationRaw } from "metabase/visualizations";
import type { Mode } from "metabase/visualizations/click-actions/Mode";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import {
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
  MOBILE_DEFAULT_CARD_HEIGHT,
} from "metabase/visualizations/shared/utils/sizes";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  BaseDashboardCard,
  Card,
  CardId,
  DashCardDataMap,
  DashCardId,
  Dashboard,
  QuestionDashboardCard,
  DashboardTabId,
  ParameterId,
  ParameterValueOrArray,
  VisualizationSettings,
  DashboardCard,
} from "metabase-types/api";

import { AddSeriesModal } from "./AddSeriesModal/AddSeriesModal";
import { DashCard } from "./DashCard/DashCard";
import type { DashCardOnChangeCardAndRunHandler } from "./DashCard/types";
import {
  DashboardCardContainer,
  DashboardGridContainer,
} from "./DashboardGrid.styled";
import { GridLayout } from "./grid/GridLayout";
import { generateMobileLayout } from "./grid/utils";

type GridBreakpoint = "desktop" | "mobile";

type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  dashcard: BaseDashboardCard;
};

type DashboardChangeItem = {
  id: DashCardId;
  attributes: Partial<BaseDashboardCard>;
};

interface DashboardGridProps {
  dashboard: Dashboard;
  dashcardData: DashCardDataMap;
  selectedTabId: DashboardTabId;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  slowCards: Record<CardId, boolean>;
  isEditing: boolean;
  isEditingParameter: boolean;
  isPublic: boolean;
  isXray: boolean;
  isFullscreen: boolean;
  isNightMode: boolean;
  clickBehaviorSidebarDashcard: DashboardCard | null;
  width: number;
  mode: Mode;
  metadata: Metadata;

  fetchCardData: (
    card: Card,
    dashcard: QuestionDashboardCard,
    options: {
      clearCache?: boolean;
      ignoreCache?: boolean;
      reload?: boolean;
    },
  ) => Promise<unknown>;
  replaceCard: (options: {
    dashcardId: DashCardId;
    nextCardId: CardId;
  }) => void;
  markNewCardSeen: (dashcardId: DashCardId) => void;

  setDashCardAttributes: (options: DashboardChangeItem) => void;
  setMultipleDashCardAttributes: (changes: {
    dashcards: Array<DashboardChangeItem>;
  }) => void;

  removeCardFromDashboard: (options: {
    dashcardId: DashCardId;
    cardId?: CardId | null;
  }) => void;
  undoRemoveCardFromDashboard: (options: { dashcardId: DashCardId }) => void;

  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings: Partial<VisualizationSettings>,
  ) => void;

  onChangeLocation: (location: LocationDescriptor) => void;
  navigateToNewCardFromDashboard: DashCardOnChangeCardAndRunHandler;

  showClickBehaviorSidebar: (dashcardId: DashCardId | null) => void;

  addUndo: (options: {
    message: string;
    undo: boolean;
    action: () => void;
  }) => void;
}

interface DashboardGridState {
  visibleCardIds: Set<number>;
  initialCardSizes: { [key: string]: { w: number; h: number } };
  layouts: { desktop: LayoutItem[]; mobile: LayoutItem[] };
  addSeriesModalDashCard: BaseDashboardCard | null;
  replaceCardModalDashCard: BaseDashboardCard | null;
  isDragging: boolean;
  isAnimationPaused: boolean;
}

const mapDispatchToProps = { addUndo };

class DashboardGrid extends Component<DashboardGridProps, DashboardGridState> {
  static contextType = ContentViewportContext;

  _pauseAnimationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: DashboardGridProps, context: unknown) {
    super(props, context);

    const visibleCardIds = getVisibleCardIds(
      props.dashboard.dashcards,
      props.dashcardData,
    );

    this.state = {
      visibleCardIds,
      initialCardSizes: this.getInitialCardSizes(props.dashboard.dashcards),
      layouts: this.getLayouts(props.dashboard.dashcards),
      addSeriesModalDashCard: null,
      replaceCardModalDashCard: null,
      isDragging: false,
      isAnimationPaused: true,
    };
  }

  static defaultProps = {
    width: 0,
    isEditing: false,
    isEditingParameter: false,
  };

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

  UNSAFE_componentWillReceiveProps(nextProps: DashboardGridProps) {
    const { dashboard, dashcardData, isEditing, selectedTabId } = nextProps;

    const visibleCardIds = !isEditing
      ? getVisibleCardIds(
          dashboard.dashcards,
          dashcardData,
          this.state.visibleCardIds,
        )
      : new Set(dashboard.dashcards.map(card => card.id));

    const cards = this.getVisibleCards(
      dashboard.dashcards,
      visibleCardIds,
      isEditing,
      selectedTabId,
    );

    if (!isEditing || !_.isEqual(this.getVisibleCards(), cards)) {
      this.setState({
        initialCardSizes: this.getInitialCardSizes(cards),
      });
    }

    this.setState({
      visibleCardIds,
      layouts: this.getLayouts(cards),
    });
  }

  getInitialCardSizes = (cards: BaseDashboardCard[]) => {
    return cards
      .map(card => this.getLayoutForDashCard(card))
      .reduce((acc, dashcardLayout) => {
        const dashcardId = dashcardLayout.i;
        return {
          ...acc,
          [dashcardId]: _.pick(dashcardLayout, ["w", "h"]),
        };
      }, {});
  };

  onLayoutChange = ({
    layout,
    breakpoint,
  }: {
    layout: LayoutItem[];
    breakpoint: GridBreakpoint;
  }) => {
    const { setMultipleDashCardAttributes, isEditing } = this.props;

    // We allow moving and resizing cards only on the desktop
    // Ensures onLayoutChange triggered by window resize,
    // won't break the main layout
    if (!isEditing || breakpoint !== "desktop") {
      return;
    }

    const changes: DashboardChangeItem[] = [];

    layout.forEach(layoutItem => {
      const dashboardCard = this.getVisibleCards().find(
        card => String(card.id) === layoutItem.i,
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
      MetabaseAnalytics.trackStructEvent("Dashboard", "Layout Changed");
    }
  };

  getLayoutForDashCard = (dashcard: BaseDashboardCard) => {
    const visualization = getVisualizationRaw([{ card: dashcard.card }]);
    const initialSize = DEFAULT_CARD_SIZE;
    const minSize = visualization?.minSize || DEFAULT_CARD_SIZE;

    let minW, minH;
    if (this.state?.initialCardSizes) {
      minW = Math.min(
        this.state?.initialCardSizes[dashcard.id]?.w,
        minSize.width,
      );
      minH = Math.min(
        this.state?.initialCardSizes[dashcard.id]?.h,
        minSize.height,
      );
    } else {
      minW = minSize.width;
      minH = minSize.height;
    }
    return {
      i: String(dashcard.id),
      x: dashcard.col || 0,
      y: dashcard.row || 0,
      w: dashcard.size_x || initialSize.width,
      h: dashcard.size_y || initialSize.height,
      dashcard: dashcard,
      minW,
      minH,
    };
  };

  getVisibleCards = (
    cards = this.props.dashboard.dashcards,
    visibleCardIds = this.state.visibleCardIds,
    isEditing = this.props.isEditing,
    selectedTabId = this.props.selectedTabId,
  ) => {
    const tabCards = cards.filter(
      card =>
        !selectedTabId ||
        card.dashboard_tab_id === selectedTabId ||
        card.dashboard_tab_id === null,
    );

    return isEditing
      ? tabCards
      : tabCards.filter(card => visibleCardIds.has(card.id));
  };

  getLayouts(cards: BaseDashboardCard[]) {
    const desktop = cards.map(this.getLayoutForDashCard);
    const mobile = generateMobileLayout({
      desktopLayout: desktop,
      defaultCardHeight: MOBILE_DEFAULT_CARD_HEIGHT,
      heightByDisplayType: MOBILE_HEIGHT_BY_DISPLAY_TYPE,
    });
    return { desktop, mobile };
  }

  getRowHeight() {
    const { width } = this.props;

    const contentViewportElement = this.context;
    const hasScroll =
      contentViewportElement?.clientHeight <
      contentViewportElement?.scrollHeight;

    const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
    const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

    // prevent infinite re-rendering when the scroll bar appears/disappears
    // https://github.com/metabase/metabase/issues/17229
    return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
  }

  renderAddSeriesModal() {
    // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
    const { addSeriesModalDashCard } = this.state;
    const isOpen =
      !!addSeriesModalDashCard && isQuestionDashCard(addSeriesModalDashCard);
    return (
      <Modal
        className={cx(
          ModalS.Modal,
          DashboardS.Modal,
          DashboardS.AddSeriesModal,
        )}
        data-testid="add-series-modal"
        isOpen={isOpen}
      >
        {isOpen && (
          <AddSeriesModal
            dashcard={addSeriesModalDashCard}
            dashcardData={this.props.dashcardData}
            fetchCardData={this.props.fetchCardData}
            setDashCardAttributes={this.props.setDashCardAttributes}
            onClose={() => this.setState({ addSeriesModalDashCard: null })}
          />
        )}
      </Modal>
    );
  }

  renderReplaceCardModal() {
    const { addUndo, replaceCard, setDashCardAttributes } = this.props;
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

    const handleClose = () => {
      this.setState({ replaceCardModalDashCard: null });
    };

    if (!hasValidDashCard) {
      return null;
    }

    return (
      <QuestionPickerModal
        onChange={handleSelect}
        value={
          replaceCardModalDashCard.card.id
            ? {
                id: replaceCardModalDashCard.card.id,
                model:
                  replaceCardModalDashCard.card.type === "model"
                    ? "dataset"
                    : "card",
              }
            : undefined
        }
        onClose={handleClose}
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
      message: t`Removed card`,
      undo: true,
      action: () =>
        this.props.undoRemoveCardFromDashboard({ dashcardId: dc.id }),
    });
    MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Card");
  };

  onDashCardAddSeries(dc: BaseDashboardCard) {
    this.setState({ addSeriesModalDashCard: dc });
  }

  onReplaceCard = (dashcard: BaseDashboardCard) => {
    this.setState({ replaceCardModalDashCard: dashcard });
  };

  getDashboardCardIcon = (dashCard: BaseDashboardCard) => {
    const { isRegularCollection } = PLUGIN_COLLECTIONS;
    const { dashboard } = this.props;
    const isRegularQuestion = isRegularCollection({
      authority_level: dashCard.collection_authority_level,
    });
    const isRegularDashboard = isRegularCollection({
      authority_level: dashboard.collection_authority_level,
    });
    const authorityLevel = dashCard.collection_authority_level;
    if (isRegularDashboard && !isRegularQuestion && authorityLevel) {
      const opts = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[authorityLevel];
      const iconSize = 14;
      return {
        name: opts.icon,
        color: opts.color ? color(opts.color) : undefined,
        tooltip: opts.tooltips?.belonging,
        size: iconSize,

        // Workaround: headerIcon on cards in a first column have incorrect offset out of the box
        targetOffsetX: dashCard.col === 0 ? iconSize : 0,
      };
    }
  };

  renderDashCard(
    dc: DashboardCard,
    {
      isMobile,
      gridItemWidth,
      totalNumGridCols,
    }: {
      isMobile: boolean;
      gridItemWidth: number;
      totalNumGridCols: number;
    },
  ) {
    return (
      <DashCard
        dashcard={dc}
        headerIcon={this.getDashboardCardIcon(dc)}
        dashcardData={this.props.dashcardData}
        parameterValues={this.props.parameterValues}
        slowCards={this.props.slowCards}
        gridItemWidth={gridItemWidth}
        totalNumGridCols={totalNumGridCols}
        markNewCardSeen={this.props.markNewCardSeen}
        isEditing={this.props.isEditing}
        isEditingParameter={this.props.isEditingParameter}
        isFullscreen={this.props.isFullscreen}
        isNightMode={this.props.isNightMode}
        isMobile={isMobile}
        isPublic={this.props.isPublic}
        isXray={this.props.isXray}
        onRemove={this.onDashCardRemove.bind(this, dc)}
        onAddSeries={this.onDashCardAddSeries.bind(this, dc)}
        onReplaceCard={() => this.onReplaceCard(dc)}
        onUpdateVisualizationSettings={this.props.onUpdateDashCardVisualizationSettings.bind(
          this,
          dc.id,
        )}
        onReplaceAllVisualizationSettings={this.props.onReplaceAllDashCardVisualizationSettings.bind(
          this,
          dc.id,
        )}
        mode={this.props.mode}
        navigateToNewCardFromDashboard={
          this.props.navigateToNewCardFromDashboard
        }
        onChangeLocation={this.props.onChangeLocation}
        metadata={this.props.metadata}
        dashboard={this.props.dashboard}
        showClickBehaviorSidebar={this.props.showClickBehaviorSidebar}
        clickBehaviorSidebarDashcard={this.props.clickBehaviorSidebarDashcard}
      />
    );
  }

  get isEditingLayout() {
    const { isEditing, isEditingParameter, clickBehaviorSidebarDashcard } =
      this.props;
    return (
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null
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
    const { isEditing } = this.props;

    const shouldChangeResizeHandle = isEditingTextOrHeadingCard(
      dc.card.display,
      isEditing,
    );

    return (
      <DashboardCardContainer
        key={String(dc.id)}
        data-testid="dashcard-container"
        className={cx(
          DashboardS.DashCard,
          EmbedFrameS.DashCard,
          LegendS.DashCard,
          {
            [DashboardS.BrandColorResizeHandle]: shouldChangeResizeHandle,
          },
        )}
        isAnimationDisabled={this.state.isAnimationPaused}
      >
        {this.renderDashCard(dc, {
          isMobile: breakpoint === "mobile",
          gridItemWidth,
          totalNumGridCols,
        })}
      </DashboardCardContainer>
    );
  };

  renderGrid() {
    const { width } = this.props;
    const { layouts } = this.state;
    const rowHeight = this.getRowHeight();
    return (
      <GridLayout
        className={cx({
          [DashboardS.DashEditing]: this.isEditingLayout,
          [DashboardS.DashDragging]: this.state.isDragging,
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
        isEditing={this.isEditingLayout}
        compactType="vertical"
        items={this.getVisibleCards()}
        itemRenderer={this.renderGridItem}
      />
    );
  }

  render() {
    const { dashboard, width } = this.props;
    return (
      <DashboardGridContainer
        data-testid="dashboard-grid"
        isFixedWidth={dashboard?.width === "fixed"}
      >
        {width > 0 ? this.renderGrid() : <div />}
        {this.renderAddSeriesModal()}
        {this.renderReplaceCardModal()}
      </DashboardGridContainer>
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

  if (type === "question") {
    return t`Question replaced`;
  }

  throw new Error(`Unknown card.type: ${type}`);
};

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connect(null, mapDispatchToProps),
)(DashboardGrid);
