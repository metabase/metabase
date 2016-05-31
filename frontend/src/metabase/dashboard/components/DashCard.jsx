import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import visualizations from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization.jsx";

import Icon from "metabase/components/Icon.jsx";

import DashCardParameterMapping from "../containers/DashCardParameterMapping.jsx";

import cx from "classnames";
import _ from "underscore";

export default class DashCard extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            error: null
        };

        _.bindAll(this, "updateVisibility");
    }

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
        cardData: PropTypes.object.isRequired,

        markNewCardSeen: PropTypes.func.isRequired,
        fetchCardData: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        const { dashcard, markNewCardSeen, fetchCardData } = this.props;

        this.visibilityTimer = window.setInterval(this.updateVisibility, 2000);
        window.addEventListener("scroll", this.updateVisibility, false);

        // HACK: way to scroll to a newly added card
        if (dashcard.justAdded) {
            ReactDOM.findDOMNode(this).scrollIntoView();
            markNewCardSeen(dashcard.id);
        }

        let cards = [dashcard.card].concat(...(dashcard.series || []));
        try {
            await Promise.all(cards.map(fetchCardData));
        } catch (error) {
            console.error("DashCard error", error)
            this.setState({ error });
        }
    }

    componentWillUnmount() {
        window.clearInterval(this.visibilityTimer);
        window.removeEventListener("scroll", this.updateVisibility, false);
    }

    updateVisibility() {
        const { isFullscreen } = this.props;
        const element = ReactDOM.findDOMNode(this);
        if (element) {
            const rect = element.getBoundingClientRect();
            const isOffscreen = (rect.bottom < 0 || rect.bottom > window.innerHeight || rect.top < 0);
            if (isFullscreen && isOffscreen) {
                element.style.opacity = 0.05;
            } else {
                element.style.opacity = 1.0;
            }
        }
    }

    render() {
        const { dashcard, cardData, cardDurations, isEditing, isEditingParameter, onAddSeries, onRemove } = this.props;

        const cards = [dashcard.card].concat(dashcard.series || []);
        const series = cards
            .map(card => ({
                card: card,
                data: cardData[card.id] && cardData[card.id].data,
                error: cardData[card.id] && cardData[card.id].error,
                duration: cardDurations[card.id]
            }));

        const loading = !(series.length > 0 && _.every(series, (s) => s.data));
        const expectedDuration = Math.max(...series.map((s) => s.duration ? s.duration.average : 0));
        const usuallyFast = _.every(series, (s) => s.duration && s.duration.average < s.duration.fast_threshold);
        const isSlow = loading && _.some(series, (s) => s.duration) && (usuallyFast ? "usually-fast" : "usually-slow");

        const errors = series.map(s => s.error).filter(e => e);
        const error = errors[0] || this.state.error;

        let errorMessage;
        if (error) {
            if (error.data) {
                errorMessage = error.data.message;
            } else if (error.status === 503) {
                errorMessage = "I'm sorry, the server timed out while asking your question."
            } else if (typeof error === "string") {
                errorMessage = error;
            } else {
                errorMessage = "Oh snap!  Something went wrong loading this card :sad:";
            }
        }

        const CardVisualization = visualizations.get(series[0].card.display);
        return (
            <div className={"Card bordered rounded flex flex-column " + cx({ "Card--recent": dashcard.isAdded, "Card--slow": isSlow === "usually-slow" })}>
                <Visualization
                    className="flex-full"
                    error={errorMessage}
                    isSlow={isSlow}
                    expectedDuration={expectedDuration}
                    series={series}
                    isDashboard={true}
                    isEditing={isEditing}
                    gridSize={this.props.isMobile ? undefined : { width: dashcard.sizeX, height: dashcard.sizeY }}
                    actionButtons={isEditing ? <DashCardActionButtons series={series} visualization={CardVisualization} onRemove={onRemove} onAddSeries={onAddSeries} /> : undefined}
                    onUpdateVisualizationSetting={this.props.onUpdateVisualizationSetting}
                    replacementContent={isEditingParameter && <DashCardParameterMapping dashcard={dashcard} />}
                />
            </div>
        );
    }
}

const DashCardActionButtons = ({ series, visualization, onRemove, onAddSeries }) =>
    <span className="DashCard-actions flex align-center">
        { visualization.supportsSeries &&
            <AddSeriesButton series={series} onAddSeries={onAddSeries} />
        }
        <RemoveButton onRemove={onRemove} />
    </span>

const RemoveButton = ({ onRemove }) =>
    <a className="text-grey-2 text-grey-4-hover expand-clickable" data-metabase-event="Dashboard;Remove Card Modal" href="#" onClick={onRemove}>
        <Icon name="close" width="14" height="14" />
    </a>

const AddSeriesButton = ({ series, onAddSeries }) =>
    <a data-metabase-event={"Dashboard;Edit Series Modal;open"} className="text-grey-2 text-grey-4-hover cursor-pointer h3 ml1 mr2 flex align-center flex-no-shrink relative" onClick={onAddSeries}>
        <Icon className="absolute" style={{ top: 2, left: 2 }} name="add" width={8} height={8} />
        <Icon name={getSeriesIconName(series)} width={24} height={24} />
        <span className="flex-no-shrink">{ series.length > 1 ? "Edit" : "Add" }</span>
    </a>

function getSeriesIconName(series) {
    try {
        let display = series[0].card.display;
        return visualizations.get(display === "scalar" ? "bar" : display).iconName;
    } catch (e) {
        return "bar";
    }
}
