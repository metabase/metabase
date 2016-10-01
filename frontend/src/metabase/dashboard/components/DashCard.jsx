import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import visualizations from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization.jsx";

import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ChartSettings from "metabase/visualizations/components/ChartSettings.jsx";

import Icon from "metabase/components/Icon.jsx";

import DashCardParameterMapper from "../components/parameters/DashCardParameterMapper.jsx";

import cx from "classnames";
import _ from "underscore";
import { getIn } from "icepick";

const ERROR_MESSAGE_GENERIC = "There was a problem displaying this chart.";
const ERROR_MESSAGE_PERMISSION = "Sorry, you don't have permission to see this card."

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
        dashcardData: PropTypes.object.isRequired,
        parameterValues: PropTypes.object.isRequired,
        markNewCardSeen: PropTypes.func.isRequired,
        fetchCardData: PropTypes.func.isRequired,
    };

    async componentDidMount() {
        const { dashcard, markNewCardSeen } = this.props;

        this.visibilityTimer = window.setInterval(this.updateVisibility, 2000);
        window.addEventListener("scroll", this.updateVisibility, false);

        // HACK: way to scroll to a newly added card
        if (dashcard.justAdded) {
            ReactDOM.findDOMNode(this).scrollIntoView();
            markNewCardSeen(dashcard.id);
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
        const { dashcard, dashcardData, cardDurations, parameterValues, isEditing, isEditingParameter, onAddSeries, onRemove } = this.props;

        const cards = [dashcard.card].concat(dashcard.series || []);
        const series = cards
            .map(card => ({
                ...getIn(dashcardData, [dashcard.id, card.id]),
                card: card,
                duration: cardDurations[card.id]
            }));

        const loading = !(series.length > 0 && _.every(series, (s) => s.data));
        const expectedDuration = Math.max(...series.map((s) => s.duration ? s.duration.average : 0));
        const usuallyFast = _.every(series, (s) => s.duration && s.duration.average < s.duration.fast_threshold);
        const isSlow = loading && _.some(series, (s) => s.duration) && (usuallyFast ? "usually-fast" : "usually-slow");

        const parameterMap = dashcard && dashcard.parameter_mappings && dashcard.parameter_mappings
            .reduce((map, mapping) => ({...map, [mapping.parameter_id]: mapping}), {});

        const isMappedToAllParameters = !parameterValues || Object.keys(parameterValues)
            .filter(parameterId => parameterValues[parameterId] !== null)
            .every(parameterId => parameterMap[parameterId]);

        const errors = series.map(s => s.error).filter(e => e);

        let errorMessage, errorIcon;
        if (_.any(errors, e => e && e.status === 403)) {
            errorMessage = ERROR_MESSAGE_PERMISSION;
            errorIcon = "key";
        } else if (errors.length > 0 || this.state.error) {
            errorMessage = ERROR_MESSAGE_GENERIC;
            errorIcon = "warning";
        }

        const CardVisualization = visualizations.get(series[0].card.display);
        return (
            <div
                className={"Card bordered rounded flex flex-column " + cx({
                    "Card--recent": dashcard.isAdded,
                    "Card--unmapped": !isMappedToAllParameters && !isEditing,
                    "Card--slow": isSlow === "usually-slow"
                })}
            >
                <Visualization
                    className="flex-full"
                    error={errorMessage}
                    errorIcon={errorIcon}
                    isSlow={isSlow}
                    expectedDuration={expectedDuration}
                    series={series}
                    isDashboard={true}
                    isEditing={isEditing}
                    gridSize={this.props.isMobile ? undefined : { width: dashcard.sizeX, height: dashcard.sizeY }}
                    actionButtons={isEditing && !isEditingParameter ?
                        <DashCardActionButtons
                            series={series}
                            visualization={CardVisualization}
                            onRemove={onRemove}
                            onAddSeries={onAddSeries}
                        /> : undefined
                    }
                    onUpdateVisualizationSetting={this.props.onUpdateVisualizationSetting}
                    replacementContent={isEditingParameter && <DashCardParameterMapper dashcard={dashcard} />}
                />
            </div>
        );
    }
}

const DashCardActionButtons = ({ series, visualization, onRemove, onAddSeries, onUpdateVisualizationSettings }) =>
    <span className="DashCard-actions flex align-center">
        { visualization.supportsSeries &&
            <AddSeriesButton series={series} onAddSeries={onAddSeries} />
        }
        { onUpdateVisualizationSettings &&
            <ChartSettingsButton series={series} onChange={onUpdateVisualizationSettings} />
        }
        <RemoveButton onRemove={onRemove} />
    </span>

const ChartSettingsButton = ({ series, onUpdateVisualizationSettings }) =>
    <ModalWithTrigger
        className="Modal Modal--wide Modal--tall"
        triggerElement={<Icon name="gear" />}
        triggerClasses="text-grey-2 text-grey-4-hover cursor-pointer mr1 flex align-center flex-no-shrink"
    >
        <ChartSettings
            series={series}
            onChange={onUpdateVisualizationSettings}
        />
    </ModalWithTrigger>

const RemoveButton = ({ onRemove }) =>
    <a className="text-grey-2 text-grey-4-hover expand-clickable" data-metabase-event="Dashboard;Remove Card Modal" href="#" onClick={onRemove}>
        <Icon name="close" size={14} />
    </a>

const AddSeriesButton = ({ series, onAddSeries }) =>
    <a
        data-metabase-event={"Dashboard;Edit Series Modal;open"}
        className="text-grey-2 text-grey-4-hover cursor-pointer h3 ml1 mr2 flex align-center flex-no-shrink relative"
        onClick={onAddSeries}
    >
        <Icon className="absolute" style={{ top: 2, left: 2 }} name="add" size={8} />
        <Icon name={getSeriesIconName(series)} size={12} />
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
