import React, { Component, PropTypes } from "react";

import { Responsive as ResponsiveReactGridLayout } from "react-grid-layout";

import MetabaseAnalytics from "metabase/lib/analytics";
import Icon from "metabase/components/Icon.jsx";
import DashCard from "./DashCard.jsx";
import Modal from "metabase/components/Modal.jsx";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal.jsx";

import { setDashCardAttributes } from "../actions";

import _ from "underscore";
import cx from "classnames";

export default class DashboardGrid extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            layouts: this.getLayouts(props),
            removeModalDashCard: null,
            rowHeight: 0,
            isDragging: false
        };
        this.calculateSizing = this.calculateSizing.bind(this);
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        isEditing: PropTypes.bool.isRequired,
        dashboard: PropTypes.object.isRequired,
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
            this.props.dispatch(setDashCardAttributes({
                id: change.dashcard.id,
                attributes: { col: change.x, row: change.y, sizeX: change.w, sizeY: change.h }
            }));
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

    onEditDashCard(dc) {
        // if editing and card is dirty prompt to save changes
        if (this.props.isEditing && this.props.isDirty) {
            if (!confirm("You have unsaved changes to this dashboard, are you sure you want to discard them?")) {
                return;
            }
        }
        this.props.onChangeLocation("/card/" + dc.card_id + "?from=" + encodeURIComponent("/dash/" + dc.dashboard_id));
    }

    renderRemoveModal() {
        // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
        return (
            <Modal isOpen={this.state.removeModalDashCard != null}>
                <RemoveFromDashboardModal
                    dispatch={this.props.dispatch}
                    dashcard={this.state.removeModalDashCard}
                    dashboard={this.props.dashboard}
                    onClose={() => this.setState({ removeModalDashCard: null })}
                />
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

    render() {
        var { dashboard } = this.props;
        return (
            <div>
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
                        <div key={dc.id} className="DashCard" onMouseDownCapture={(...args) => this.onDashCardMouseDown(...args)}>
                            <DashCard
                                key={dc.id}
                                dashcard={dc}
                                dispatch={this.props.dispatch}
                            />
                            <div className="DashCard-actions absolute top right text-brand p1">
                                <a href="#" onClick={() => this.onEditDashCard(dc)}>
                                    <Icon className="m1" name="pencil" width="24" height="24" />
                                </a>
                                <a data-metabase-event="Dashboard;Remove Card Modal" href="#" onClick={() => this.setState({ removeModalDashCard: dc })}>
                                    <Icon className="m1" name="trash" width="24" height="24" />
                                </a>
                            </div>
                        </div>
                    )}
                </ResponsiveReactGridLayout>
                {this.renderRemoveModal()}
            </div>
        );
    }
}
