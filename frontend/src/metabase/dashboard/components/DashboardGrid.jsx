/* eslint-disable react/prop-types */
import { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";
import cx from "classnames";
import { connect } from "react-redux";
import { t } from "ttag";
import ExplicitSize from "metabase/components/ExplicitSize";

import Modal from "metabase/components/Modal";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

import { getVisualizationRaw } from "metabase/visualizations";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import { getVisibleCardIds } from "metabase/dashboard/utils";

import {
  GRID_WIDTH,
  GRID_ASPECT_RATIO,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  DEFAULT_CARD_SIZE,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import { addUndo } from "metabase/redux/undo";
import {
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
  MOBILE_DEFAULT_CARD_HEIGHT,
} from "metabase/visualizations/shared/utils/sizes";

import { DashboardCard } from "./DashboardGrid.styled";

import { GridLayout } from "./grid/GridLayout";
import { generateMobileLayout } from "./grid/utils";

import { AddSeriesModal } from "./AddSeriesModal/AddSeriesModal";
import { DashCard } from "./DashCard/DashCard";

const mapDispatchToProps = { addUndo };

class DashboardGrid extends Component {
  static contextType = ContentViewportContext;

  constructor(props, context) {
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
      isDragging: false,
      isAnimationPaused: true,
    };
  }

  static propTypes = {
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isEditingParameter: PropTypes.bool.isRequired,
    isNightMode: PropTypes.bool,
    dashboard: PropTypes.object.isRequired,
    parameterValues: PropTypes.object.isRequired,

    setDashCardAttributes: PropTypes.func.isRequired,
    setMultipleDashCardAttributes: PropTypes.func.isRequired,
    removeCardFromDashboard: PropTypes.func.isRequired,
    markNewCardSeen: PropTypes.func.isRequired,
    fetchCardData: PropTypes.func.isRequired,

    onUpdateDashCardVisualizationSettings: PropTypes.func.isRequired,
    onReplaceAllDashCardVisualizationSettings: PropTypes.func.isRequired,

    onChangeLocation: PropTypes.func.isRequired,
  };

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
    clearTimeout(this._pauseAnimationTimer);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
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

  getInitialCardSizes = cards => {
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

  onLayoutChange = ({ layout, breakpoint }) => {
    const { setMultipleDashCardAttributes, isEditing } = this.props;

    // We allow moving and resizing cards only on the desktop
    // Ensures onLayoutChange triggered by window resize,
    // won't break the main layout
    if (!isEditing || breakpoint !== "desktop") {
      return;
    }

    const changes = [];

    layout.forEach(layoutItem => {
      const dashboardCard = this.getVisibleCards().find(
        card => String(card.id) === layoutItem.i,
      );

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
    });

    if (changes.length > 0) {
      setMultipleDashCardAttributes({ dashcards: changes });
      MetabaseAnalytics.trackStructEvent("Dashboard", "Layout Changed");
    }
  };

  getLayoutForDashCard = dashcard => {
    const visualization = getVisualizationRaw([{ card: dashcard.card }]);
    const initialSize = DEFAULT_CARD_SIZE;
    const minSize = visualization.minSize || DEFAULT_CARD_SIZE;

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

  getLayouts(cards) {
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
    const isOpen = this.state.addSeriesModalDashCard != null;
    return (
      <Modal
        className="Modal AddSeriesModal"
        data-testid="add-series-modal"
        isOpen={isOpen}
      >
        {isOpen && (
          <AddSeriesModal
            dashcard={this.state.addSeriesModalDashCard}
            dashboard={this.props.dashboard}
            dashcardData={this.props.dashcardData}
            databases={this.props.databases}
            fetchCardData={this.props.fetchCardData}
            removeCardFromDashboard={this.props.removeCardFromDashboard}
            setDashCardAttributes={this.props.setDashCardAttributes}
            onClose={() => this.setState({ addSeriesModalDashCard: null })}
          />
        )}
      </Modal>
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

  onDashCardRemove(dc) {
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
  }

  onDashCardAddSeries(dc) {
    this.setState({ addSeriesModalDashCard: dc });
  }

  getDashboardCardIcon = dashCard => {
    const { isRegularCollection } = PLUGIN_COLLECTIONS;
    const { dashboard } = this.props;
    const isRegularQuestion = isRegularCollection({
      authority_level: dashCard.collection_authority_level,
    });
    const isRegularDashboard = isRegularCollection({
      authority_level: dashboard.collection_authority_level,
    });
    if (isRegularDashboard && !isRegularQuestion) {
      const authorityLevel = dashCard.collection_authority_level;
      const opts = PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[authorityLevel];
      const iconSize = 14;
      return {
        name: opts.icon,
        color: color(opts.color),
        tooltip: opts.tooltips?.belonging,
        size: iconSize,

        // Workaround: headerIcon on cards in a first column have incorrect offset out of the box
        targetOffsetX: dashCard.col === 0 ? iconSize : 0,
      };
    }
  };

  renderDashCard(dc, { isMobile, gridItemWidth, totalNumGridCols }) {
    return (
      <DashCard
        dashcard={dc}
        headerIcon={this.getDashboardCardIcon(dc)}
        dashcardData={this.props.dashcardData}
        parameterValues={this.props.parameterValues}
        slowCards={this.props.slowCards}
        fetchCardData={this.props.fetchCardData}
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
  }) => {
    const { isEditing } = this.props;

    const shouldChangeResizeHandle = isEditingTextOrHeadingCard(
      dc.card.display,
      isEditing,
    );

    return (
      <DashboardCard
        key={String(dc.id)}
        className={cx("DashCard", {
          BrandColorResizeHandle: shouldChangeResizeHandle,
        })}
        isAnimationDisabled={this.state.isAnimationPaused}
      >
        {this.renderDashCard(dc, {
          isMobile: breakpoint === "mobile",
          gridItemWidth,
          totalNumGridCols,
        })}
      </DashboardCard>
    );
  };

  renderGrid() {
    const { width } = this.props;
    const { layouts } = this.state;
    const rowHeight = this.getRowHeight();
    return (
      <GridLayout
        className={cx("DashboardGrid", {
          "Dash--editing": this.isEditingLayout,
          "Dash--dragging": this.state.isDragging,
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
    const { width } = this.props;
    return (
      <div className="flex layout-centered" data-testid="dashboard-grid">
        {width > 0 ? this.renderGrid() : <div />}
        {this.renderAddSeriesModal()}
      </div>
    );
  }
}

function isEditingTextOrHeadingCard(display, isEditing) {
  const isTextOrHeadingCard = display === "heading" || display === "text";

  return isEditing && isTextOrHeadingCard;
}

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connect(null, mapDispatchToProps),
)(DashboardGrid);
