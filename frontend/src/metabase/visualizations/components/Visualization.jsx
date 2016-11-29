/* eslint "react/prop-types": "warn" */

import React, { Component, PropTypes } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { duration, formatNumber } from "metabase/lib/formatting";

import { getVisualizationTransformed } from "metabase/visualizations";
import { getSettings } from "metabase/lib/visualization_settings";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import Utils from "metabase/lib/utils";

import { MinRowsError, ChartSettingsError } from "metabase/visualizations/lib/errors";

import { assoc, getIn, setIn } from "icepick";
import _ from "underscore";
import cx from "classnames";

export const ERROR_MESSAGE_GENERIC = "There was a problem displaying this chart.";
export const ERROR_MESSAGE_PERMISSION = "Sorry, you don't have permission to see this card."

@ExplicitSize
export default class Visualization extends Component {
    constructor(props, context) {
        super(props, context)

        this.state = {
            hovered: null,
            error: null,
            warnings: [],
            yAxisSplit: null,
        };

        _.bindAll(this, "onRender", "onRenderError", "onHoverChange");
    }

    static propTypes = {
        series: PropTypes.array.isRequired,

        className: PropTypes.string,

        isDashboard: PropTypes.bool,
        isEditing: PropTypes.bool,

        actionButtons: PropTypes.node,

        // errors
        error: PropTypes.string,
        errorIcon: PropTypes.string,

        // slow card warnings
        isSlow: PropTypes.bool,
        expectedDuration: PropTypes.number,

        // injected by ExplicitSize
        width: PropTypes.number,
        height: PropTypes.number,

        // settings overrides from settings panel
        settings: PropTypes.object,

        // used for showing content in place of visualization, e.x. dashcard filter mapping
        replacementContent: PropTypes.node,

        // used by TableInteractive
        setSortFn: PropTypes.func,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func,

        // misc
        onUpdateWarnings: PropTypes.func,
        onOpenChartSettings: PropTypes.func,
    };

    static defaultProps = {
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
            yAxisSplit: null,
            warnings: [],
            ...getVisualizationTransformed(newProps.series)
        });
    }

    onHoverChange(hovered) {
        const { yAxisSplit } = this.state;
        if (hovered) {
            // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
            if (yAxisSplit) {
                const axisIndex = _.findIndex(yAxisSplit, (indexes) => _.contains(indexes, hovered.index));
                hovered = assoc(hovered, "axisIndex", axisIndex);
            }
        }
        this.setState({ hovered });
    }

    onRender({ yAxisSplit, warnings = [] } = {}) {
        this.setState({ yAxisSplit, warnings });
    }

    onRenderError(error) {
        this.setState({ error })
    }

    render() {
        const { actionButtons, className, isDashboard, width, errorIcon, isSlow, expectedDuration, replacementContent } = this.props;
        const { series, CardVisualization } = this.state;
        const small = width < 330;

        let error = this.props.error || this.state.error;
        let loading = !(series.length > 0 && _.every(series, (s) => s.data));
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
                        CardVisualization.checkRenderable(series[0].data.cols, series[0].data.rows, settings);
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

        // if on dashoard, and error didn't come from props replace it with the generic error message
        if (isDashboard && error && this.props.error !== error) {
            error = ERROR_MESSAGE_GENERIC;
        }

        if (!error) {
            noResults = getIn(series, [0, "data", "rows", "length"]) === 0;
        }

        let extra = (
            <span className="flex align-center">
                {isSlow && !loading &&
                    <LoadingSpinner size={18} className={cx("Visualization-slow-spinner", isSlow === "usually-slow" ? "text-gold" : "text-slate")}/>
                }
                {actionButtons}
            </span>
        );

        return (
            <div className={cx(className, "flex flex-column")}>
                { isDashboard && (settings["card.title"] || extra) && (loading || error || !CardVisualization.noHeader) || replacementContent ?
                    <div className="p1 flex-no-shrink">
                        <LegendHeader
                            series={
                                settings["card.title"] ?
                                    // if we have a card title set, use it
                                    setIn(series, [0, "card", "name"], settings["card.title"]) :
                                    // otherwise use the original series
                                    series
                            }
                            actionButtons={extra}
                            settings={settings}
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
                            <img src="/app/img/no_results.svg" />
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
                    <CardVisualization
                        {...this.props}
                        className="flex-full"
                        series={series}
                        settings={settings}
                        card={series[0].card} // convienence for single-series visualizations
                        data={series[0].data} // convienence for single-series visualizations
                        hovered={this.state.hovered}
                        onHoverChange={this.onHoverChange}
                        onRenderError={this.onRenderError}
                        onRender={this.onRender}
                    />
                }
            </div>
        );
    }
}
