import React, { Component } from "react";
import PropTypes from "prop-types";

import GridLayout from "./grid/GridLayout.jsx";
import DashCard from "./DashCard.jsx";

import Modal from "metabase/components/Modal.jsx";
import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal.jsx";
import AddSeriesModal from "./AddSeriesModal.jsx";

import { getVisualizationRaw } from "metabase/visualizations";
import MetabaseAnalytics from "metabase/lib/analytics";

import {
  GRID_WIDTH,
  GRID_ASPECT_RATIO,
  GRID_MARGIN,
  DEFAULT_CARD_SIZE,
} from "metabase/lib/dashboard_grid";

import _ from "underscore";
import cx from "classnames";

const MOBILE_ASPECT_RATIO = 3 / 2;
const MOBILE_TEXT_CARD_ROW_HEIGHT = 40;

@ExplicitSize()
export default class DashboardGrid extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      layout: this.getLayout(props),
      dashcards: this.getSortedDashcards(props),
      removeModalDashCard: null,
      addSeriesModalDashCard: null,
      isDragging: false,
    };

    _.bindAll(this, "onDashCardMouseDown");
  }

  static propTypes = {
    isEditing: PropTypes.bool.isRequired,
    isEditingParameter: PropTypes.bool.isRequired,
    dashboard: PropTypes.object.isRequired,
    parameterValues: PropTypes.object.isRequired,
    cards: PropTypes.array,

    setDashCardAttributes: PropTypes.func.isRequired,
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

  componentWillReceiveProps(nextProps) {
    this.setState({
      dashcards: this.getSortedDashcards(nextProps),
      layout: this.getLayout(nextProps),
    });
  }

  onLayoutChange(layout) {
    let changes = layout.filter(
      newLayout =>
        !_.isEqual(newLayout, this.getLayoutForDashCard(newLayout.dashcard)),
    );
    for (let change of changes) {
      this.props.setDashCardAttributes({
        id: change.dashcard.id,
        attributes: {
          col: change.x,
          row: change.y,
          sizeX: change.w,
          sizeY: change.h,
        },
      });
    }

    if (changes && changes.length > 0) {
      MetabaseAnalytics.trackEvent("Dashboard", "Layout Changed");
    }
  }

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
    let { CardVisualization } = getVisualizationRaw([{ card: dashcard.card }]);
    let initialSize = DEFAULT_CARD_SIZE;
    let minSize = CardVisualization.minSize || DEFAULT_CARD_SIZE;
    return {
      i: String(dashcard.id),
      x: dashcard.col || 0,
      y: dashcard.row || 0,
      w: dashcard.sizeX || initialSize.width,
      h: dashcard.sizeY || initialSize.height,
      dashcard: dashcard,
      minSize: minSize,
    };
  }

  getLayout(props) {
    return props.dashboard.ordered_cards.map(this.getLayoutForDashCard);
  }

  renderRemoveModal() {
    // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
    let isOpen = this.state.removeModalDashCard != null;
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
    let isOpen = this.state.addSeriesModalDashCard != null;
    return (
      <Modal className="Modal AddSeriesModal" isOpen={isOpen}>
        {isOpen && (
          <AddSeriesModal
            dashcard={this.state.addSeriesModalDashCard}
            dashboard={this.props.dashboard}
            cards={this.props.cards}
            dashcardData={this.props.dashcardData}
            databases={this.props.databases}
            fetchCards={this.props.fetchCards}
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
  onDrag() {
    if (!this.state.isDragging) {
      this.setState({ isDragging: true });
    }
  }
  onDragStop() {
    this.setState({ isDragging: false });
  }

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

  renderDashCard(dc, isMobile) {
    return (
      <DashCard
        dashcard={dc}
        dashcardData={this.props.dashcardData}
        parameterValues={this.props.parameterValues}
        slowCards={this.props.slowCards}
        fetchCardData={this.props.fetchCardData}
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
        navigateToNewCardFromDashboard={
          this.props.navigateToNewCardFromDashboard
        }
        metadata={this.props.metadata}
        dashboard={this.props.dashboard}
      />
    );
  }

  renderMobile() {
    const { isEditing, isEditingParameter, width } = this.props;
    const { dashcards } = this.state;
    return (
      <div
        className={cx("DashboardGrid", {
          "Dash--editing": isEditing,
          "Dash--editingParameter": isEditingParameter,
          "Dash--dragging": this.state.isDragging,
        })}
        style={{ margin: 0 }}
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
              {this.renderDashCard(dc, true)}
            </div>
          ))}
      </div>
    );
  }

  renderGrid() {
    const { dashboard, isEditing, isEditingParameter, width } = this.props;
    const rowHeight = Math.floor(width / GRID_WIDTH / GRID_ASPECT_RATIO);
    return (
      <GridLayout
        className={cx("DashboardGrid", {
          "Dash--editing": isEditing,
          "Dash--editingParameter": isEditingParameter,
          "Dash--dragging": this.state.isDragging,
        })}
        layout={this.state.layout}
        cols={GRID_WIDTH}
        margin={GRID_MARGIN}
        rowHeight={rowHeight}
        onLayoutChange={(...args) => this.onLayoutChange(...args)}
        onDrag={(...args) => this.onDrag(...args)}
        onDragStop={(...args) => this.onDragStop(...args)}
        isEditing={isEditing}
      >
        {dashboard &&
          dashboard.ordered_cards.map(dc => (
            <div
              key={dc.id}
              className="DashCard"
              onMouseDownCapture={this.onDashCardMouseDown}
              onTouchStartCapture={this.onDashCardMouseDown}
            >
              {this.renderDashCard(dc, false)}
            </div>
          ))}
      </GridLayout>
    );
  }

  render() {
    const { width } = this.props;
    return (
      <div className="flex layout-centered">
        {width === 0 ? (
          <div />
        ) : width <= 752 ? (
          this.renderMobile()
        ) : (
          this.renderGrid()
        )}
        {this.renderRemoveModal()}
        {this.renderAddSeriesModal()}
      </div>
    );
  }
}
