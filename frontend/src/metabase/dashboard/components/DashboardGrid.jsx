/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import ExplicitSize from "metabase/components/ExplicitSize";

import Modal from "metabase/components/Modal";

import { getVisualizationRaw } from "metabase/visualizations";
import MetabaseAnalytics from "metabase/lib/analytics";

import {
  GRID_WIDTH,
  GRID_ASPECT_RATIO,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  DEFAULT_CARD_SIZE,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";

import _ from "underscore";
import cx from "classnames";

import GridLayout from "./grid/GridLayout";
import { generateMobileLayout } from "./grid/utils";
import AddSeriesModal from "./AddSeriesModal";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal";
import DashCard from "./DashCard";

@ExplicitSize()
export default class DashboardGrid extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      layouts: this.getLayouts(props),
      dashcards: this.getSortedDashcards(props),
      removeModalDashCard: null,
      addSeriesModalDashCard: null,
      isDragging: false,
    };
  }

  static propTypes = {
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isEditingParameter: PropTypes.bool.isRequired,
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

  UNSAFE_componentWillReceiveProps(nextProps) {
    this.setState({
      dashcards: this.getSortedDashcards(nextProps),
      layouts: this.getLayouts(nextProps),
    });
  }

  onLayoutChange = ({ layout, breakpoint }) => {
    // We allow moving and resizing cards only on the desktop
    // Ensures onLayoutChange triggered by window resize,
    // won't break the main layout
    if (breakpoint !== "desktop") {
      return;
    }

    const { dashboard, setMultipleDashCardAttributes } = this.props;
    const changes = [];

    layout.forEach(layoutItem => {
      const dashboardCard = dashboard.ordered_cards.find(
        card => String(card.id) === layoutItem.i,
      );

      const changed = !_.isEqual(
        layoutItem,
        this.getLayoutForDashCard(dashboardCard),
      );

      if (changed) {
        changes.push({
          id: dashboardCard.id,
          attributes: {
            col: layoutItem.x,
            row: layoutItem.y,
            sizeX: layoutItem.w,
            sizeY: layoutItem.h,
          },
        });
      }
    });

    if (changes.length > 0) {
      setMultipleDashCardAttributes(changes);
      MetabaseAnalytics.trackEvent("Dashboard", "Layout Changed");
    }
  };

  getSortedDashcards(props) {
    return (
      props.dashboard &&
      props.dashboard.ordered_cards.sort((a, b) => {
        if (a.row < b.row) {
          return -1;
        }
        if (a.row > b.row) {
          return 1;
        }
        if (a.col < b.col) {
          return -1;
        }
        if (a.col > b.col) {
          return 1;
        }
        return 0;
      })
    );
  }

  getLayoutForDashCard(dashcard) {
    const { visualization } = getVisualizationRaw([{ card: dashcard.card }]);
    const initialSize = DEFAULT_CARD_SIZE;
    const minSize = visualization.minSize || DEFAULT_CARD_SIZE;
    return {
      i: String(dashcard.id),
      x: dashcard.col || 0,
      y: dashcard.row || 0,
      w: dashcard.sizeX || initialSize.width,
      h: dashcard.sizeY || initialSize.height,
      dashcard: dashcard,
      minW: minSize.width,
      minH: minSize.height,
    };
  }

  getLayouts({ dashboard }) {
    const desktop = dashboard.ordered_cards.map(this.getLayoutForDashCard);
    const mobile = generateMobileLayout({
      desktopLayout: desktop,
      // We want to keep the heights for all visualizations equal not to break the visual rhythm
      // Exceptions are text cards (can take too much vertical space)
      // and scalar value cards (basically a number and some text on a big card)
      heightByDisplayType: {
        text: 2,
        scalar: 4,
      },
      defaultCardHeight: 6,
    });
    return { desktop, mobile };
  }

  renderRemoveModal() {
    // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
    const isOpen = this.state.removeModalDashCard != null;
    return (
      <Modal isOpen={isOpen}>
        {isOpen && (
          <RemoveFromDashboardModal
            dashcard={this.state.removeModalDashCard}
            dashboard={this.props.dashboard}
            removeCardFromDashboard={this.props.removeCardFromDashboard}
            onClose={() => this.setState({ removeModalDashCard: null })}
          />
        )}
      </Modal>
    );
  }

  renderAddSeriesModal() {
    // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
    const isOpen = this.state.addSeriesModalDashCard != null;
    return (
      <Modal className="Modal AddSeriesModal" isOpen={isOpen}>
        {isOpen && (
          <AddSeriesModal
            dashcard={this.state.addSeriesModalDashCard}
            dashboard={this.props.dashboard}
            dashcardData={this.props.dashcardData}
            databases={this.props.databases}
            fetchCardData={this.props.fetchCardData}
            fetchDatabaseMetadata={this.props.fetchDatabaseMetadata}
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
    this.setState({ removeModalDashCard: dc });
  }

  onDashCardAddSeries(dc) {
    this.setState({ addSeriesModalDashCard: dc });
  }

  renderDashCard(dc, { isMobile, gridItemWidth }) {
    return (
      <DashCard
        dashcard={dc}
        dashcardData={this.props.dashcardData}
        parameterValues={this.props.parameterValues}
        slowCards={this.props.slowCards}
        fetchCardData={this.props.fetchCardData}
        gridItemWidth={gridItemWidth}
        markNewCardSeen={this.props.markNewCardSeen}
        isEditing={this.props.isEditing}
        isEditingParameter={this.props.isEditingParameter}
        isFullscreen={this.props.isFullscreen}
        isMobile={isMobile}
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
    const {
      isEditing,
      isEditingParameter,
      clickBehaviorSidebarDashcard,
    } = this.props;
    return (
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null
    );
  }

  renderGridItem = ({ item: dc, breakpoint, gridItemWidth }) => (
    <div key={String(dc.id)} className="DashCard">
      {this.renderDashCard(dc, {
        isMobile: breakpoint === "mobile",
        gridItemWidth,
      })}
    </div>
  );

  renderGrid() {
    const { dashboard, width } = this.props;
    const { layouts } = this.state;
    const rowHeight = Math.max(
      Math.floor(width / GRID_WIDTH / GRID_ASPECT_RATIO),
      MIN_ROW_HEIGHT,
    );
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
        items={dashboard.ordered_cards}
        itemRenderer={this.renderGridItem}
      />
    );
  }

  render() {
    const { width } = this.props;
    return (
      <div className="flex layout-centered">
        {width > 0 ? this.renderGrid() : <div />}
        {this.renderRemoveModal()}
        {this.renderAddSeriesModal()}
      </div>
    );
  }
}
