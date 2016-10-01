import React, { Component, PropTypes } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { duration } from "metabase/lib/formatting";

import visualizations from "metabase/visualizations";
import { getSettings } from "metabase/lib/visualization_settings";

import { assoc, getIn } from "icepick";
import _ from "underscore";
import cx from "classnames";

@ExplicitSize
export default class Visualization extends Component {
    constructor(props, context) {
        super(props, context)

        this.state = {
            renderInfo: null,
            hovered: null,
            error: null
        };

        _.bindAll(this, "onRender", "onRenderError", "onHoverChange");
    }

    static propTypes = {
        series: PropTypes.array.isRequired,

        isDashboard: PropTypes.bool,
        isEditing: PropTypes.bool,

        // used by TableInteractive
        setSortFn: PropTypes.func,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func
    };

    static defaultProps = {
        isDashboard: false,
        isEditing: false,
        onUpdateVisualizationSetting: (...args) => console.warn("onUpdateVisualizationSetting", args)
    };

    componentWillReceiveProps() {
        // clear the error so we can try to render again
        this.setState({ error: null });
    }

    onHoverChange(hovered) {
        const { renderInfo } = this.state;
        if (hovered) {
            // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
            if (renderInfo && renderInfo.yAxisSplit) {
                const axisIndex = _.findIndex(renderInfo.yAxisSplit, (indexes) => _.contains(indexes, hovered.index));
                hovered = assoc(hovered, "axisIndex", axisIndex);
            }
        }
        this.setState({ hovered });
    }

    onRender(renderInfo) {
        this.setState({ renderInfo });
    }

    onRenderError(error) {
        this.setState({ error })
    }

    render() {
        const { series, actionButtons, className, isDashboard, width, errorIcon, isSlow, expectedDuration, replacementContent } = this.props;
        const CardVisualization = visualizations.get(series[0].card.display);
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
                    // MinRowsError
                    if (e.actualRows === 0) {
                        noResults = true;
                    }
                    error = e.message || "Could not display this chart with this data.";
                }
            }
        }
        if (!error) {
            noResults = getIn(series, [0, "data", "rows", "length"]) === 0;
        }

        let extra;
        if (!loading) {
            extra = actionButtons;
        } else if (isSlow) {
            extra = <LoadingSpinner className={isSlow === "usually-slow" ? "text-gold" : "text-slate"} size={18} />
        }

        return (
            <div className={cx(className, "flex flex-column")}>
                { isDashboard && (loading || error || !CardVisualization.noHeader) || replacementContent ?
                    <div className="p1 flex-no-shrink">
                        <LegendHeader
                            series={series}
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
                    <div className="flex-full px1 pb1 text-centered text-slate flex flex-column layout-centered">
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
                    <div className="flex-full px1 pb1 text-centered text-slate-light flex flex-column layout-centered">
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
