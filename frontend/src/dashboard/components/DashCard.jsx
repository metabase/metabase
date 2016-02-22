/*global $clamp*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import visualizations from "metabase/visualizations";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import _ from "underscore";

export default class DashCard extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null
        };
    }

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
        cardData: PropTypes.object.isRequired,

        markNewCardSeen: PropTypes.func.isRequired,
        fetchCardData: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        const { dashcard } = this.props;

        // HACK: way to scroll to a newly added card
        if (dashcard.justAdded) {
            ReactDOM.findDOMNode(this).scrollIntoView();
            this.props.markNewCardSeen(dashcard.id);
        }

        try {
            await Promise.all([
                this.props.fetchCardData(dashcard.card)
            ].concat(
                dashcard.series && dashcard.series.map(this.props.fetchCardData)
            ));
        } catch (error) {
            console.error("DashCard error", error)
            this.setState({ error });
        }
    }

    renderCard(CardVisualization) {
        const { dashcard, cardData, isEditing, onAddSeries } = this.props;
        const cards = [dashcard.card].concat(dashcard.series || []);
        const series = cards
            .map(card => ({
                card: card,
                data: cardData[card.id] && cardData[card.id].data,
                error: cardData[card.id] && cardData[card.id].error,
            }));
        const errors = series.map(s => s.error).filter(e => e);
        const error = errors[0] || this.state.error;

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

        if (series.length > 0 && _.every(series, (s) => s.data)) {
            return (
                <Visualization
                    className="flex-full"
                    series={series}
                    isDashboard={true}
                    onAddSeries={isEditing && CardVisualization.supportsSeries ? onAddSeries : undefined}
                    extraActions={isEditing ? <ExtraActions onRemove={this.props.onRemove} /> : undefined}
                />
            );
        }

        return (
            <div className="p1 text-brand text-centered flex-full flex flex-column layout-centered">
                <LoadingSpinner />
                <h1 className="ml1 text-normal text-grey-2">Loading...</h1>
            </div>
        );
    }

    componentDidUpdate() {
        let titleElement = ReactDOM.findDOMNode(this.refs.title);
        if (titleElement) {
            // have to restore the text in case we previously clamped it :-/
            titleElement.textContent = this.props.dashcard.card.name;
            $clamp(titleElement, { clamp: 2 });
        }
    }

    render() {
        const { dashcard, onAddSeries, onRemove, isEditing } = this.props;
        const series = [dashcard.card].concat(dashcard.series || []).map(card => ({ card }));
        const CardVisualization = visualizations.get(series[0].card.display);
        return (
            <div className={"Card bordered rounded flex flex-column " + cx({ "Card--recent": dashcard.isAdded })}>
                { !CardVisualization.noHeader &&
                    <div className="p1">
                        <LegendHeader
                            series={series}
                            onAddSeries={isEditing && CardVisualization.supportsSeries ? onAddSeries : undefined}
                            extraActions={isEditing ? <ExtraActions onRemove={onRemove} /> : undefined}
                        />
                    </div>
                }
                {this.renderCard(CardVisualization)}
            </div>
        );
    }
}

const ExtraActions = ({ onRemove }) =>
    <span className="text-brand">
        <a data-metabase-event="Dashboard;Remove Card Modal" href="#" onClick={onRemove}>
            <Icon className="my1" name="trash" width="18" height="18" />
        </a>
    </span>
