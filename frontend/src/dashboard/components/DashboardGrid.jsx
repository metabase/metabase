import React, { Component, PropTypes } from "react";

import { Responsive as ResponsiveReactGridLayout } from "react-grid-layout";

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
            layouts: this.getLayouts(props),
            removeModalDashCard: null,
            addSeriesModalDashCard: null,
            rowHeight: 0,
            isDragging: false
        };

        _.bindAll(this, "calculateSizing", "onDashCardMouseDown");
    }

    static propTypes = {
        isEditing: PropTypes.bool.isRequired,
        dashboard: PropTypes.object.isRequired,

        setDashCardAttributes: PropTypes.func.isRequired,
        removeCardFromDashboard: PropTypes.func.isRequired,
        markNewCardSeen: PropTypes.func.isRequired,
        fetchDashCardData: PropTypes.func.isRequired,

        onChangeLocation: PropTypes.func.isRequired
    };

    componentWillReceiveProps(nextProps) {
        this.setState({
            layouts: this.getLayouts(nextProps)
        });
    }

    onLayoutChange(layout, allLayouts) {
        // only set the layout for large breakpoint
        if (layout !== allLayouts["lg"]) {
            return;
        }
        var changes = layout.filter(newLayout => {
            return !_.isEqual(newLayout, this.getLayoutForDashCard(newLayout.dashcard))
        });
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

    getLayouts(props) {
        var mainLayout = props.dashboard.ordered_cards.map(this.getLayoutForDashCard);
        // for mobile just layout cards vertically
        var mobileLayout = mainLayout.map((l, i) => ({ ...l, x: 0, y: i * 4, w: 6, h: 4}));
        return { lg: mainLayout, sm: mobileLayout };
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
                    fetchCards={this.props.fetchCards}
                    removeCardFromDashboard={this.props.removeCardFromDashboard}
                    onClose={() => this.setState({ addSeriesModalDashCard: null })}
                /> }
            </Modal>
        );
    }

    // make grid square by getting the container width, then dividing by 6
    calculateSizing() {
        let width = React.findDOMNode(this).offsetWidth;
        let rowHeight = Math.floor(width / 6);
        if (this.state.rowHeight !== rowHeight) {
            this.setState({ rowHeight });
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
    onDrag(layout, oldItem, newItem, placeholder, e) {
        if (!this.state.isDragging) {
            this.setState({ isDragging: true });
        }
    }
    onDragStop(layout, oldItem, newItem, placeholder, e) {
        this.setState({ isDragging: false });
    }

    // we use onMouseDownCapture to prevent dragging due to react-grid-layout bug referenced below
    onDashCardMouseDown(e) {
        if (!this.props.isEditing) {
            e.stopPropagation();
        }
    }

    onDashCardEdit(dc) {
        // if editing and card is dirty prompt to save changes
        if (this.props.isEditing && this.props.isDirty) {
            if (!confirm("You have unsaved changes to this dashboard, are you sure you want to discard them?")) {
                return;
            }
        }
        this.props.onChangeLocation("/card/" + dc.card_id + "?from=" + encodeURIComponent("/dash/" + dc.dashboard_id));
    }

    onDashCardRemove(dc) {
        this.setState({ removeModalDashCard: dc });
    }

    onDashCardAddSeries(dc) {
        this.setState({ addSeriesModalDashCard: dc });
    }

    render() {
        var { dashboard } = this.props;
        return (
            <div className="flex-full full">
                <ResponsiveReactGridLayout
                    className={cx("DashboardGrid", { "Dash--editing": this.props.isEditing, "Dash--dragging": this.state.isDragging })}
                    breakpoints={{lg: 753, sm: 752}}
                    layouts={this.state.layouts}
                    // NOTE: these need to be different otherwise RGL doesn't switch breakpoints
                    // https://github.com/STRML/react-grid-layout/issues/92
                    cols={{lg: 6, sm: 1}}
                    // NOTE: ideally this would vary based on the breakpoint but RGL doesn't support that yet
                    // instead we keep the same row height and adjust the layout height to get the right aspect ratio
                    rowHeight={this.state.rowHeight}
                    verticalCompact={false}
                    // NOTE: currently leaving these true always instead of using this.props.isEditing due to perf issues caused by
                    // https://github.com/STRML/react-grid-layout/issues/89
                    isDraggable={true}
                    isResizable={true}
                    onLayoutChange={(...args) => this.onLayoutChange(...args)}
                    onDrag={(...args) => this.onDrag(...args)}
                    onDragStop={(...args) => this.onDragStop(...args)}
                >
                    {dashboard.ordered_cards.map(dc =>
                        <div key={dc.id} className="DashCard" onMouseDownCapture={this.onDashCardMouseDown}>
                            <DashCard
                                dashcard={dc}
                                fetchDashCardData={this.props.fetchDashCardData}
                                markNewCardSeen={this.props.markNewCardSeen}
                                onEdit={this.onDashCardEdit.bind(this, dc)}
                                onRemove={this.onDashCardRemove.bind(this, dc)}
                                onAddSeries={this.onDashCardAddSeries.bind(this, dc)}
                            />
                        </div>
                    )}
                </ResponsiveReactGridLayout>
                {this.renderRemoveModal()}
                {this.renderAddSeriesModal()}
            </div>
        );
    }
}
