"use strict";
/*global _*/

import ReactGridLayout from "react-grid-layout";
import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import DashCard from "./DashCard.react";
import RemoveFromDashboardModal from "./RemoveFromDashboardModal.react";

import { setDashCardAttributes } from "../actions";

import cx from "classnames";

export default class DashboardGrid extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            layout: this.getLayout(props),
            removeModalDashCard: null
        };
    }

    componentWillReceiveProps(nextProps) {
        this.setState({ layout: this.getLayout(nextProps) });
    }

    onLayoutChange(layout) {
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

    onEditDashCard(dc) {
        if (this.props.isDirty && !confirm("You have unsaved changes to this dashboard, are you sure you want to discard them?")) {
            return;
        }
        this.props.onChangeLocation("/card/" + dc.card_id + "?from=" + encodeURIComponent("/dash/" + dc.dashboard_id));
    }

    renderRemoveModal() {
        // can't use PopoverWithTrigger due to strange interaction with ReactGridLayout
        if (this.state.removeModalDashCard != null) {
            return (
                <RemoveFromDashboardModal
                    dispatch={this.props.dispatch}
                    dashcard={this.state.removeModalDashCard}
                    dashboard={this.props.dashboard}
                    onClose={() => this.setState({ removeModalDashCard: null })}
                />
            );
        }
    }

    render() {
        var { dashboard } = this.props;
        // margin-left and margin-right offsets the 10px padding inserted by RGL
        return (
            <div style={{marginLeft: "-10px", marginRight: "-10px"}}>
                <ReactGridLayout
                    className={cx("DashboardGrid", { "Dash--editing": this.props.isEditing })}
                    cols={6}
                    rowHeight={175}
                    verticalCompact={false}
                    isDraggable={this.props.isEditing}
                    isResizable={this.props.isEditing || true}
                    onLayoutChange={(layout) => this.onLayoutChange(layout)}
                    layout={this.state.layout}
                >
                    {dashboard.ordered_cards.map(dc =>
                        <div key={dc.id} className="DashCard">
                            <DashCard
                                key={dc.id}
                                dashcard={dc}
                                dispatch={this.props.dispatch}
                                visualizationSettingsApi={this.props.visualizationSettingsApi}
                            />
                            <div className="DashCard-actions absolute top right text-brand p1">
                                <a href="#" onClick={() => this.onEditDashCard(dc)}>
                                    <Icon className="m1" name="pencil" width="24" height="24" />
                                </a>
                                <a href="#" onClick={() => this.setState({ removeModalDashCard: dc })}>
                                    <Icon className="m1" name="trash" width="24" height="24" />
                                </a>
                            </div>
                        </div>
                    )}
                </ReactGridLayout>
                {this.renderRemoveModal()}
            </div>
        );
    }
}

DashboardGrid.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    isEditing: React.PropTypes.bool.isRequired,
    dashboard: React.PropTypes.object.isRequired,
    visualizationSettingsApi: React.PropTypes.object.isRequired,
    onChangeLocation: React.PropTypes.func.isRequired
};
