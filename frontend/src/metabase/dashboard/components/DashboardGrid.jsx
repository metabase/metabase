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
  GRID_MARGIN,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  DEFAULT_CARD_SIZE,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";

import _ from "underscore";
import cx from "classnames";

import GridLayout from "./grid/GridLayout";
import { adaptLayoutForBreakpoint } from "./grid/utils";
import AddSeriesModal from "./AddSeriesModal";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal";
import DashCard from "./DashCard";

const MOBILE_ASPECT_RATIO = 3 / 2;
const MOBILE_TEXT_CARD_ROW_HEIGHT = 60;

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

    _.bindAll(this, "onDashCardMouseDown");
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
    if (breakpoint !== "lg") {
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
    const lg = dashboard.ordered_cards.map(this.getLayoutForDashCard);
    const layout = { lg };

    layout.md = adaptLayoutForBreakpoint({
      layout,
      breakpoints: GRID_BREAKPOINTS,
      targetBreakpoint: "md",
      closestBreakpoint: "lg",
      columns: GRID_COLUMNS.md,
      compactType: "vertical",
    });

    layout.sm = adaptLayoutForBreakpoint({
      layout,
      breakpoints: GRID_BREAKPOINTS,
      targetBreakpoint: "sm",
      closestBreakpoint: "md",
      columns: GRID_COLUMNS.sm,
      compactType: "vertical",
    });

    return layout;
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

  // we use onMouseDownCapture to prevent dragging due to react-grid-layout bug referenced below
  onDashCardMouseDown(e) {
    if (!this.props.isEditing) {
      e.stopPropagation();
    }
  }

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

  renderMobile() {
    const { width } = this.props;
    const { dashcards } = this.state;
    return (
      <div
        className={cx("DashboardGrid", {
          "Dash--editing": this.isEditingLayout,
          "Dash--dragging": this.state.isDragging,
        })}
      >
        {dashcards &&
          dashcards.map(dc => (
            <div
              key={dc.id}
              className="DashCard"
              style={{
                width: width,
                marginTop: 10,
                marginBottom: 10,
                height:
                  // "text" cards should get a height based on their dc sizeY
                  dc.card.display === "text"
                    ? MOBILE_TEXT_CARD_ROW_HEIGHT * dc.sizeY
                    : width / MOBILE_ASPECT_RATIO,
              }}
            >
              {this.renderDashCard(dc, {
                isMobile: true,
                gridItemWidth: width,
              })}
            </div>
          ))}
      </div>
    );
  }

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
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        rowHeight={rowHeight}
        onLayoutChange={this.onLayoutChange}
        onDrag={this.onDrag}
        onDragStop={this.onDragStop}
        isEditing={this.isEditingLayout}
        compactType="vertical"
        items={dashboard.ordered_cards}
        itemRenderer={({ item: dc, gridItemWidth }) => (
          <div
            key={String(dc.id)}
            className="DashCard"
            onMouseDownCapture={this.onDashCardMouseDown}
            onTouchStartCapture={this.onDashCardMouseDown}
          >
            {this.renderDashCard(dc, { isMobile: false, gridItemWidth })}
          </div>
        )}
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
