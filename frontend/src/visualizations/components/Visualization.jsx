import React, { Component, PropTypes } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import visualizations from "metabase/visualizations";

import i from "icepick";
import _ from "underscore";
import cx from "classnames";

const ERROR_MESSAGE_GENERIC = "There was a problem displaying this chart.";

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

    onHoverChange(hovered) {
        const { renderInfo } = this.state;
        if (hovered) {
            // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
            if (renderInfo && renderInfo.yAxisSplit) {
                const axisIndex = _.findIndex(renderInfo.yAxisSplit, (indexes) => _.contains(indexes, hovered.index));
                hovered = i.assoc(hovered, "axisIndex", axisIndex);
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
        const { series, actionButtons, className, isDashboard, width } = this.props;
        const CardVisualization = visualizations.get(series[0].card.display);
        const small = width < 330;

        let error = this.props.error || this.state.error;
        let loading = !(series.length > 0 && _.every(series, (s) => s.data));

        if (!loading && !error) {
            if (!CardVisualization) {
                error = "Could not find visualization";
            } else {
                try {
                    if (CardVisualization.checkRenderable) {
                        CardVisualization.checkRenderable(series[0].data.cols, series[0].data.rows);
                    }
                } catch (e) {
                    error = e.message || "Could not display this chart with this data.";
                }
            }
        }

        return (
            <div className={cx(className, "flex flex-column")}>
                { isDashboard && (loading || error || !CardVisualization.noHeader) ?
                    <div className="p1 flex-no-shrink">
                        <LegendHeader
                            series={series}
                            actionButtons={actionButtons}
                        />
                    </div>
                : null
                }
                { error ?
                    <div className="flex-full px1 pb1 text-centered text-slate-light flex flex-column layout-centered">
                        <Tooltip tooltip={isDashboard ? ERROR_MESSAGE_GENERIC : error} isEnabled={small}>
                            <Icon className="mb2" name="warning" width={50} height={50} />
                        </Tooltip>
                        { !small &&
                            <span className="h4 text-bold">
                                { isDashboard ? ERROR_MESSAGE_GENERIC : error }
                            </span>
                        }
                    </div>
                : loading ?
                    <div className="flex-full p1 text-centered text-brand flex flex-column layout-centered">
                        <LoadingSpinner />
                        <span className="h4 text-bold ml1 text-slate-light">
                            Loading...
                        </span>
                    </div>
                :
                    <CardVisualization
                        {...this.props}
                        className="flex-full"
                        series={series}
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
