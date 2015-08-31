"use strict";

import React, { Component, PropTypes } from "react";

import ScalarCard from "./cards/ScalarCard.react";
import TableCard from "./cards/TableCard.react";
import ChartCard from "./cards/ChartCard.react";

import LoadingSpinner from "metabase/components/LoadingSpinner.react";

import { fetchDashCardData, markNewCardSeen } from "../actions";

import cx from "classnames";

class DashCard extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    async componentDidMount() {
        // HACK: way to scroll to a newly added card
        if (this.props.dashcard.justAdded) {
            React.findDOMNode(this).scrollIntoView();
            this.props.dispatch(markNewCardSeen(this.props.dashcard.id));
        }

        try {
            await this.props.dispatch(fetchDashCardData(this.props.dashcard.id));
        } catch (error) {
            this.setState({ error });
        }
    }

    renderCard() {
        let { card, dataset } = this.props.dashcard;
        let data = (dataset && dataset.data);
        let error = (dataset && dataset.error) || this.state.error;

        if (error) {
            let message = (error.data && error.data.message) || error;
            return (
                <div className="p1 text-centered flex-full flex flex-column layout-centered">
                    <h2 className="text-normal text-grey-2">{message}</h2>
                </div>
            );
        }

        if (card && data) {
            switch (card.display) {
                case "table":  return <TableCard  className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                case "scalar": return <ScalarCard className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                default:       return <ChartCard  className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
            }
        }

        return (
            <div className="p1 text-brand text-centered flex-full flex flex-column layout-centered">
                <LoadingSpinner />
                <h1 className="ml1 text-normal text-grey-2">Loading...</h1>
            </div>
        );
    }

    render() {
        let { card } = this.props.dashcard;
        let recent = this.props.dashcard.isAdded;
        return (
            <div className={"Card bordered rounded flex flex-column " + cx({ "Card--recent": recent })}>
                <div className="Card-heading my1 px2">
                    <h3 className="text-normal my1">
                        <a className="Card-title link" href={"/card/"+card.id+"?clone"}>{card.name}</a>
                    </h3>
                </div>
                {this.renderCard()}
            </div>
        );
    }
}

DashCard.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    dashcard: React.PropTypes.object.isRequired,
    visualizationSettingsApi: React.PropTypes.object.isRequired
};

export default DashCard;
