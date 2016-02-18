import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import GridLayout from "./grid/GridLayout.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

import DashCard from "./DashCard.jsx";
import Modal from "metabase/components/Modal.jsx";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal.jsx";
import AddSeriesModal from "./AddSeriesModal.jsx";

import _ from "underscore";
import cx from "classnames";

export default class DashboardGrid extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            layout: this.getLayout(props),
            removeModalDashCard: null,
            addSeriesModalDashCard: null,
            width: 0,
            isDragging: false
        };

        _.bindAll(this, "calculateSizing", "onDashCardMouseDown");
    }

    static propTypes = {
        isEditing: PropTypes.bool.isRequired,
        dashboard: PropTypes.object.isRequired,
        cards: PropTypes.array,

        setDashCardAttributes: PropTypes.func.isRequired,
        removeCardFromDashboard: PropTypes.func.isRequired,
        markNewCardSeen: PropTypes.func.isRequired,
        fetchCardData: PropTypes.func.isRequired,

        onChangeLocation: PropTypes.func.isRequired
    };

    componentWillReceiveProps(nextProps) {
        this.setState({
            layout: this.getLayout(nextProps)
        });
    }

    onLayoutChange(layout) {
        var changes = layout.filter(newLayout => !_.isEqual(newLayout, this.getLayoutForDashCard(newLayout.dashcard)));
        for (var change of changes) {
            this.props.setDashCardAttributes({
                id: change.dashcard.id,
                attributes: { col: change.x, row: change.y, sizeX: change.w, sizeY: change.h }
            });
            change.dashcard.col = change.x;
            change.dashcard.row = change.y;
            change.dashcard.sizeX = change.w;
            change.dashcard.sizeY = change.h;
        }

        if (changes && changes.length > 0) {
            MetabaseAnalytics.trackEvent("Dashboard", "Layout Changed");
        }
    }

    getLayoutForDashCard(dc) {
        return ({
            i: String(dc.id),
            x: dc.col || 0,
            y: dc.row || 0,
            w: dc.sizeX || 2,
            h: dc.sizeY || 2,
            dashcard: dc
        });
    }

    getLayout(props) {
        return props.dashboard.ordered_cards.map(this.getLayoutForDashCard);
    }

    renderRemoveModal() {
        // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
        let isOpen = this.state.removeModalDashCard != null;
        return (
            <Modal isOpen={isOpen}>
                { isOpen && <RemoveFromDashboardModal
                    dashcard={this.state.removeModalDashCard}
                    dashboard={this.props.dashboard}
                    removeCardFromDashboard={this.props.removeCardFromDashboard}
                    onClose={() => this.setState({ removeModalDashCard: null })}
                /> }
            </Modal>
        );
    }

    renderAddSeriesModal() {
        // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
        let isOpen = this.state.addSeriesModalDashCard != null;
        return (
            <Modal className="Modal AddSeriesModal" isOpen={isOpen}>
                { isOpen && <AddSeriesModal
                    dashcard={this.state.addSeriesModalDashCard}
                    dashboard={this.props.dashboard}
                    cards={this.props.cards}
                    cardData={this.props.cardData}
                    databases={this.props.databases}
                    fetchCards={this.props.fetchCards}
                    fetchCardData={this.props.fetchCardData}
                    fetchDatabaseMetadata={this.props.fetchDatabaseMetadata}
                    removeCardFromDashboard={this.props.removeCardFromDashboard}
                    setDashCardAttributes={this.props.setDashCardAttributes}
                    onClose={() => this.setState({ addSeriesModalDashCard: null })}
                /> }
            </Modal>
        );
    }

    // make grid square by getting the container width, then dividing by 6
    calculateSizing() {
        let width = ReactDOM.findDOMNode(this).offsetWidth;
        if (this.state.width !== width) {
            this.setState({ width });
        }
    }

    componentDidMount() {
        window.addEventListener('resize', this.calculateSizing);
        this.calculateSizing();
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.calculateSizing);
    }

    componentDidUpdate() {
        this.calculateSizing();
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

    renderMobile() {
        const { dashboard, isEditing } = this.props;
        const { width } = this.state;
        return (
            <div
                className={cx("DashboardGrid", { "Dash--editing": isEditing, "Dash--dragging": this.state.isDragging })}
                style={{ margin: 0 }}
            >
                {dashboard.ordered_cards.map(dc =>
                    <div key={dc.id} className="DashCard" style={{ left: 10, width: width - 20, marginTop: 10, marginBottom: 10, height: width / (6 / 4)}}>
                        <DashCard
                            dashcard={dc}
                            cardData={this.props.cardData}
                            fetchCardData={this.props.fetchCardData}
                            markNewCardSeen={this.props.markNewCardSeen}
                            isEditing={isEditing}
                            onRemove={this.onDashCardRemove.bind(this, dc)}
                            onAddSeries={this.onDashCardAddSeries.bind(this, dc)}
                        />
                    </div>
                )}
            </div>
        )
    }

    renderGrid() {
        const { dashboard, isEditing } = this.props;
        const { width } = this.state;
        const rowHeight = Math.floor(width / 6);
        return (
            <GridLayout
                className={cx("DashboardGrid", { "Dash--editing": isEditing, "Dash--dragging": this.state.isDragging })}
                layout={this.state.layout}
                cols={6}
                rowHeight={rowHeight}
                onLayoutChange={(...args) => this.onLayoutChange(...args)}
                onDrag={(...args) => this.onDrag(...args)}
                onDragStop={(...args) => this.onDragStop(...args)}
            >
                {dashboard.ordered_cards.map(dc =>
                    <div key={dc.id} className="DashCard" onMouseDownCapture={this.onDashCardMouseDown}>
                        <DashCard
                            dashcard={dc}
                            cardData={this.props.cardData}
                            fetchCardData={this.props.fetchCardData}
                            markNewCardSeen={this.props.markNewCardSeen}
                            isEditing={isEditing}
                            onRemove={this.onDashCardRemove.bind(this, dc)}
                            onAddSeries={this.onDashCardAddSeries.bind(this, dc)}
                        />
                    </div>
                )}
            </GridLayout>
        )
    }

    render() {
        const { width } = this.state;
        return (
            <div>
                { width === 0 ?
                    <div />
                : width <= 752 ?
                    this.renderMobile()
                :
                    this.renderGrid()
                }
                {this.renderRemoveModal()}
                {this.renderAddSeriesModal()}
            </div>
        );
    }
}
