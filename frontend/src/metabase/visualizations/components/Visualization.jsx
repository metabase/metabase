/* @flow weak */

import React, { Component, Element } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import ChartTooltip from "metabase/visualizations/components/ChartTooltip.jsx";
import ChartClickActions from "metabase/visualizations/components/ChartClickActions.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { duration, formatNumber } from "metabase/lib/formatting";
import MetabaseAnalytics from "metabase/lib/analytics";

import { getVisualizationTransformed, extractRemappings } from "metabase/visualizations";
import { getSettings } from "metabase/visualizations/lib/settings";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import Utils from "metabase/lib/utils";
import { datasetContainsNoResults } from "metabase/lib/dataset";

import { MinRowsError, ChartSettingsError } from "metabase/visualizations/lib/errors";

import { assoc, setIn } from "icepick";
import _ from "underscore";
import cx from "classnames";

export const ERROR_MESSAGE_GENERIC = "There was a problem displaying this chart.";
export const ERROR_MESSAGE_PERMISSION = "Sorry, you don't have permission to see this card."

import Question from "metabase-lib/lib/Question";
import type { Card as CardObject, VisualizationSettings } from "metabase/meta/types/Card";
import type { HoverObject, ClickObject, Series, OnChangeCardAndRun } from "metabase/meta/types/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";

type Props = {
    series: Series,

    className: string,

    showTitle: boolean,
    isDashboard: boolean,
    isEditing: boolean,

    actionButtons: Element<any>,

    // errors
    error: string,
    errorIcon: string,

    // slow card warnings
    isSlow: boolean,
    expectedDuration: number,

    // injected by ExplicitSize
    width: number,
    height: number,

    // settings overrides from settings panel
    settings: VisualizationSettings,

    // for click actions
    metadata: Metadata,
    onChangeCardAndRun: OnChangeCardAndRun,

    // used for showing content in place of visualization, e.x. dashcard filter mapping
    replacementContent: Element<any>,

    // misc
    onUpdateWarnings: (string[]) => void,
    onOpenChartSettings: () => void,

    // number of grid cells wide and tall
    gridSize?: { width: number, height: number },
    // if gridSize isn't specified, compute using this gridSize (4x width, 3x height)
    gridUnit?: number,
}

type State = {
    series: ?Series,
    CardVisualization: ?(Component<void, VisualizationSettings, void> & {
        checkRenderable: (any, any) => void,
        noHeader: boolean
    }),

    hovered: ?HoverObject,
    clicked: ?ClickObject,

    error: ?Error,
    warnings: string[],
    yAxisSplit: ?number[][],
}

@ExplicitSize
export default class Visualization extends Component {
    state: State;
    props: Props;

    _resetHoverTimer: ?number;

    constructor(props: Props) {
        super(props);

        this.state = {
            hovered: null,
            clicked: null,
            error: null,
            warnings: [],
            yAxisSplit: null,
            series: null,
            CardVisualization: null
        };
    }

    static defaultProps = {
        showTitle: false,
        isDashboard: false,
        isEditing: false,
        onUpdateVisualizationSettings: (...args) => console.warn("onUpdateVisualizationSettings", args)
    };

    componentWillMount() {
        this.transform(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (!isSameSeries(newProps.series, this.props.series) || !Utils.equals(newProps.settings, this.props.settings)) {
            this.transform(newProps);
        }
    }

    componentDidMount() {
        this.updateWarnings();
    }

    componentDidUpdate(prevProps, prevState) {
        if (!Utils.equals(this.getWarnings(prevProps, prevState), this.getWarnings())) {
            this.updateWarnings();
        }
    }

    // $FlowFixMe
    getWarnings(props = this.props, state = this.state) {
        let warnings = state.warnings || [];
        // don't warn about truncated data for table since we show a warning in the row count
        if (state.series[0].card.display !== "table") {
            warnings = warnings.concat(props.series
                .filter(s => s.data && s.data.rows_truncated != null)
                .map(s => `Data truncated to ${formatNumber(s.data.rows_truncated)} rows.`));
        }
        return warnings;
    }

    updateWarnings() {
        if (this.props.onUpdateWarnings) {
            this.props.onUpdateWarnings(this.getWarnings() || []);
        }
    }

    transform(newProps) {
        this.setState({
            hovered: null,
            clicked: null,
            error: null,
            warnings: [],
            yAxisSplit: null,
            ...getVisualizationTransformed(extractRemappings(newProps.series))
        });
    }

    handleHoverChange = (hovered) => {
        if (hovered) {
            const { yAxisSplit } = this.state;
            // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
            if (yAxisSplit) {
                const axisIndex = _.findIndex(yAxisSplit, (indexes) => _.contains(indexes, hovered.index));
                hovered = assoc(hovered, "axisIndex", axisIndex);
            }
            this.setState({ hovered });
            // If we previously set a timeout for clearing the hover clear it now since we received
            // a new hover.
            if (this._resetHoverTimer !== null) {
                clearTimeout(this._resetHoverTimer);
                this._resetHoverTimer = null;
            }
        } else {
            // When reseting the hover wait in case we're simply transitioning from one
            // element to another. This allows visualizations to use mouseleave events etc.
            this._resetHoverTimer = setTimeout(() => {
                this.setState({ hovered: null });
                this._resetHoverTimer = null;
            }, 0);
        }
    }

    getClickActions(clicked: ?ClickObject) {
        if (!clicked) {
            return [];
        }
        // TODO: push this logic into Question?
        const { series, metadata } = this.props;
        const seriesIndex = clicked.seriesIndex || 0;
        const card = series[seriesIndex].card;
        const question = new Question(metadata, card);
        const mode = question.mode();
        return mode ? mode.actionsForClick(clicked) : [];
    }

    visualizationIsClickable = (clicked: ClickObject) => {
        const { onChangeCardAndRun } = this.props;
        if (!onChangeCardAndRun) {
            return false;
        }
        try {
            return this.getClickActions(clicked).length > 0;
        } catch (e) {
            console.warn(e);
            return false;
        }
    }

    handleVisualizationClick = (clicked: ClickObject) => {
        if (clicked) {
            MetabaseAnalytics.trackEvent(
                "Actions",
                "Clicked",
                `${clicked.column ? "column" : ""} ${clicked.value ? "value" : ""} ${clicked.dimensions ? "dimensions=" + clicked.dimensions.length : ""}`
            );
        }

        // needs to be delayed so we don't clear it when switching from one drill through to another
        setTimeout(() => {
            this.setState({ clicked });
        }, 100);
    };

    // Add the underlying card of current series to onChangeCardAndRun if available
    handleOnChangeCardAndRun = ({ nextCard, seriesIndex }: { nextCard: CardObject, seriesIndex: number }) => {
        const { series, clicked } = this.state;

        const index = seriesIndex || (clicked && clicked.seriesIndex) || 0;
        const previousCard: ?CardObject = series && series[index] && series[index].card;

        this.props.onChangeCardAndRun({ nextCard, previousCard });
    }

    onRender = ({ yAxisSplit, warnings = [] } = {}) => {
        this.setState({ yAxisSplit, warnings });
    }

    onRenderError = (error) => {
        this.setState({ error })
    }

    hideActions = () => {
        this.setState({ clicked: null })
    }

    render() {
        const { actionButtons, className, showTitle, isDashboard, width, height, errorIcon, isSlow, expectedDuration, replacementContent } = this.props;
        const { series, CardVisualization } = this.state;
        const small = width < 330;

        let { hovered, clicked } = this.state;

        const clickActions = this.getClickActions(clicked);
        if (clickActions.length > 0) {
            hovered = null;
        }

        let error = this.props.error || this.state.error;
        let loading = !(series && series.length > 0 && _.every(series, (s) => s.data));
        let noResults = false;

        // don't try to load settings unless data is loaded
        let settings = this.props.settings || {};

        if (!loading && !error) {
            settings = this.props.settings || getSettings(series);
            if (!CardVisualization) {
                error = "Could not find visualization";
            } else {
                try {
                    if (CardVisualization.checkRenderable) {
                        CardVisualization.checkRenderable(series, settings);
                    }
                } catch (e) {
                    error = e.message || "Could not display this chart with this data.";
                    if (e instanceof ChartSettingsError && this.props.onOpenChartSettings) {
                        error = (
                            <div>
                                <div>{error}</div>
                                <div className="mt2">
                                    <button className="Button Button--primary Button--medium" onClick={this.props.onOpenChartSettings}>
                                        {e.buttonText}
                                    </button>
                                </div>
                            </div>
                        );
                    } else if (e instanceof MinRowsError) {
                        noResults = true;
                    }
                }
            }
        }

        if (!error) {
            // $FlowFixMe
            noResults = _.every(series, s => s && s.data && datasetContainsNoResults(s.data));
        }

        let extra = (
            <span className="flex align-center">
                {isSlow && !loading &&
                    <LoadingSpinner size={18} className={cx("Visualization-slow-spinner", isSlow === "usually-slow" ? "text-gold" : "text-slate")}/>
                }
                {actionButtons}
            </span>
        );

        let { gridSize, gridUnit } = this.props;
        if (!gridSize && gridUnit) {
            gridSize = {
                width: Math.round(width / (gridUnit * 4)),
                height: Math.round(height / (gridUnit * 3)),
            };
        }

        return (
            <div className={cx(className, "flex flex-column")}>
                { showTitle && (settings["card.title"] || extra) && (loading || error || noResults || !(CardVisualization && CardVisualization.noHeader)) || replacementContent ?
                    <div className="p1 flex-no-shrink">
                        <LegendHeader
                            series={
                                settings["card.title"] ?
                                    // if we have a card title set, use it
                                    // $FlowFixMe
                                    setIn(series, [0, "card", "name"], settings["card.title"]) :
                                    // otherwise use the original series
                                    series
                            }
                            actionButtons={extra}
                            description={settings["card.description"]}
                            settings={settings}
                            onChangeCardAndRun={this.props.onChangeCardAndRun ? this.handleOnChangeCardAndRun : null}
                        />
                    </div>
                : null
                }
                { replacementContent ?
                    replacementContent
                // on dashboards we should show the "No results!" warning if there are no rows or there's a MinRowsError and actualRows === 0
                : isDashboard && noResults ?
                    <div className={"flex-full px1 pb1 text-centered flex flex-column layout-centered " + (isDashboard ? "text-slate-light" : "text-slate")}>
                        <Tooltip tooltip="No results!" isEnabled={small}>
                            <img src="../app/assets/img/no_results.svg" />
                        </Tooltip>
                        { !small &&
                            <span className="h4 text-bold">
                                No results!
                            </span>
                        }
                    </div>
                : error ?
                    <div className={"flex-full px1 pb1 text-centered flex flex-column layout-centered " + (isDashboard ? "text-slate-light" : "text-slate")}>
                        <Tooltip tooltip={error} isEnabled={small}>
                            <Icon className="mb2" name={errorIcon || "warning"} size={50} />
                        </Tooltip>
                        { !small &&
                            <span className="h4 text-bold">
                                {error}
                            </span>
                        }
                    </div>
                : loading ?
                    <div className="flex-full p1 text-centered text-brand flex flex-column layout-centered">
                        { isSlow ?
                            <div className="text-slate">
                                <div className="h4 text-bold mb1">Still Waiting...</div>
                                { isSlow === "usually-slow" ?
                                    <div>
                                        This usually takes an average of <span style={{whiteSpace: "nowrap"}}>{duration(expectedDuration)}</span>.
                                        <br />
                                        (This is a bit long for a dashboard)
                                    </div>
                                :
                                    <div>
                                        This is usually pretty fast, but seems to be taking awhile right now.
                                    </div>
                                }
                            </div>
                        :
                            <LoadingSpinner className="text-slate" />
                        }
                    </div>
                :
                    // $FlowFixMe
                    <CardVisualization
                        {...this.props}
                        className="flex-full"
                        series={series}
                        settings={settings}
                        // $FlowFixMe
                        card={series[0].card} // convenience for single-series visualizations
                        // $FlowFixMe
                        data={series[0].data} // convenience for single-series visualizations
                        hovered={hovered}
                        onHoverChange={this.handleHoverChange}
                        onVisualizationClick={this.handleVisualizationClick}
                        visualizationIsClickable={this.visualizationIsClickable}
                        onRenderError={this.onRenderError}
                        onRender={this.onRender}
                        onActionDismissal={this.hideActions}
                        gridSize={gridSize}
                        onChangeCardAndRun={this.props.onChangeCardAndRun ? this.handleOnChangeCardAndRun : null}
                    />
                }
                <ChartTooltip
                    series={series}
                    hovered={hovered}
                />
                { this.props.onChangeCardAndRun &&
                    <ChartClickActions
                        clicked={clicked}
                        clickActions={clickActions}
                        onChangeCardAndRun={this.handleOnChangeCardAndRun}
                        onClose={this.hideActions}
                    />
                }
            </div>
        );
    }
}
