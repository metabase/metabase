import React, { Component, PropTypes } from "react";

import LegendHeader from "metabase/visualizations/components/LegendHeader.jsx";
import visualizations from "metabase/visualizations";

import i from "icepick";
import _ from "underscore";
import cx from "classnames";

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

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { card, data } = newProps.series[0]
        if (!data) {
            this.setState({ error: "No data (TODO)" });
        } else if (!card.display) {
            this.setState({ error: "Chart type not set" });
        } else {
            let CardVisualization = visualizations.get(card.display);
            try {
                if (CardVisualization.checkRenderable) {
                    CardVisualization.checkRenderable(data.cols, data.rows);
                }
                this.setState({ error: null });
            } catch (e) {
                this.setState({ error: e.message || "Missing error message (TODO)" });
            }
        }
    }

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
        let { series, actionButtons, className, isDashboard } = this.props;
        let CardVisualization = visualizations.get(series[0].card.display);
        let error = this.props.error || this.state.error;
        return (
            <div className={cx(className, "flex flex-column")}>
                { isDashboard && (error || !CardVisualization.noHeader) ?
                    <div className="p1 flex-no-shrink">
                        <LegendHeader
                            series={series}
                            actionButtons={actionButtons}
                        />
                    </div>
                : null
                }
                { error ?
                    <div className="QueryError flex flex-full align-center text-error">
                        <div className="QueryError-iconWrapper hide">
                            <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                            </svg>
                        </div>
                        <span className="QueryError-message">{error}</span>
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
