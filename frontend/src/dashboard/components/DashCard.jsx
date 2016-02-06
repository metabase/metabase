/*global $clamp*/

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Visualization from "metabase/visualizations/Visualization.jsx";
import visualizations from "metabase/visualizations";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

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
        // HACK: way to scroll to a newly added card
        if (this.props.dashcard.justAdded) {
            ReactDOM.findDOMNode(this).scrollIntoView();
            this.props.markNewCardSeen(this.props.dashcard.id);
        }

        try {
            await * [
                this.props.fetchCardData(this.props.dashcard.card)
            ].concat(
                this.props.dashcard.series.map(this.props.fetchCardData)
            );
        } catch (error) {
            this.setState({ error });
        }
    }

    renderCard() {
        const { dashcard, cardData } = this.props;
        const dataset = cardData[dashcard.card.id];
        const data = dataset && dataset.data;

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

        if (dashcard.card && data) {
            let series = dashcard.series
            .filter(card => !!cardData[card.id])
            .map(card => ({
                card: card,
                data: cardData[card.id].data
            }));
            return (
                <Visualization
                    className="flex-full"
                    card={dashcard.card}
                    data={data}
                    series={series}
                    isDashboard={true}
                    onAddSeries={this.props.onAddSeries}
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
        const { dashcard } = this.props;
        const { card } = dashcard;
        const CardVisualization = visualizations.get(card.display);
        return (
            <div>
                <div className={"Card bordered rounded flex flex-column " + cx({ "Card--recent": dashcard.isAdded })}>
                    { !CardVisualization.noHeader &&
                        <div className="Card-heading my1 px2">
                            <a data-metabase-event={"Dashboard;Card Link;"+card.display} className="Card-title no-decoration" href={"/card/"+card.id+"?clone"}>
                                <div ref="title" className="h3 text-bold my1">
                                    {card.name}
                                </div>
                            </a>
                        </div>
                    }
                    {this.renderCard()}
                </div>
                <div className="DashCard-actions absolute top right text-brand p2">
                    <a href="#" onClick={this.props.onEdit}>
                        <Icon className="my1 mr1" name="pencil" width="18" height="18" />
                    </a>
                    <a data-metabase-event="Dashboard;Remove Card Modal" href="#" onClick={this.props.onRemove}>
                        <Icon className="my1 mr1" name="trash" width="18" height="18" />
                    </a>
                </div>
            </div>
        );
    }
}
