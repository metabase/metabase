/*global $clamp*/

import React, { Component, PropTypes } from "react";

import ScalarCard from "./cards/ScalarCard.jsx";
import TableCard from "./cards/TableCard.jsx";
import ChartCard from "./cards/ChartCard.jsx";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import { fetchDashCardData, markNewCardSeen } from "../actions";

import cx from "classnames";

export default class DashCard extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { error: null };
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        dashcard: PropTypes.object.isRequired,
        visualizationSettingsApi: PropTypes.object.isRequired
    };

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
            let message;
            if (error.data) {
                message = error.data.message;
            } else if (error.status === 503) {
                message = "I'm sorry, the server timed out while asking your question."
            } else if (typeof error === "string") {
                message = error;
            } else {
                message = "Oh snap!  Something went wrong loading this card :sad:";
            }
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

    componentDidUpdate() {
        let titleElement = React.findDOMNode(this.refs.title);
        // have to restore the text in case we previously clamped it :-/
        titleElement.textContent = this.props.dashcard.card.name;
        $clamp(titleElement, { clamp: 2 });
    }

    render() {
        let { card } = this.props.dashcard;
        let recent = this.props.dashcard.isAdded;
        return (
            <div className={"Card bordered rounded flex flex-column " + cx({ "Card--recent": recent })}>
                <div className="Card-heading my1 px2">
                    <a className="Card-title link" href={"/card/"+card.id+"?clone"}>
                        <div ref="title" className="h3 text-normal my1">
                            {card.name}
                        </div>
                    </a>
                </div>
                {this.renderCard()}
            </div>
        );
    }
}
