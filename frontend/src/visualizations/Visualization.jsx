import React, { Component, PropTypes } from "react";

import visualizations from ".";

import { getSettingsForVisualization } from "metabase/lib/visualization_settings";

import _ from "underscore";
import d3 from "d3";

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
        card: PropTypes.object.isRequired,
        data: PropTypes.object.isRequired,
        series: PropTypes.array,

        isDashboard: PropTypes.bool,

        // used by TableInteractive
        setSortFn: PropTypes.func,
        cellIsClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func
    };

    static defaultProps = {
        isDashboard: false
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (!newProps.data) {
            this.setState({ error: "No data (TODO)" });
        } else if (!newProps.card.display) {
            this.setState({ error: "Chart type not set" });
        } else {
            let CardVisualization = visualizations.get(newProps.card.display);
            try {
                if (CardVisualization.checkRenderable) {
                    CardVisualization.checkRenderable(newProps.data.cols, newProps.data.rows);
                }
                this.setState({ error: null });
            } catch (e) {
                this.setState({ error: e.message || "Missing error message (TODO)" });
            }
        }
    }

    onHoverChange(e, d, seriesIndex) {
        const { renderInfo } = this.state;
        let axisIndex = null;
        // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
        if (renderInfo && renderInfo.yAxisSplit) {
            axisIndex = _.findIndex(renderInfo.yAxisSplit, (indexes) => _.contains(indexes, seriesIndex));
        }
        this.setState({ hovered: {
            element: e,
            data: d && d.data,
            seriesIndex: seriesIndex,
            axisIndex: axisIndex,
            event: d3.event
        }});
    }

    onRender(renderInfo) {
        this.setState({ renderInfo });
    }

    onRenderError(error) {
        this.setState({ error })
    }

    render() {
        let error = this.props.error || this.state.error;
        if (error) {
            return (
                <div className="QueryError flex full align-center text-error">
                    <div className="QueryError-iconWrapper">
                        <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                            <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                        </svg>
                    </div>
                    <span className="QueryError-message">{error}</span>
                </div>
            );
        } else {
            let { card, data, series } = this.props;
            let CardVisualization = visualizations.get(card.display);

            series = [{ card, data }].concat(series || []).map(s => ({
                ...s,
                card: {
                    ...s.card,
                    visualization_settings: getSettingsForVisualization(s.card.visualization_settings, s.card.display)
                }
            }));

            return (
                <CardVisualization
                    {...this.props}
                    series={series}
                    card={series[0].card}
                    data={series[0].data}
                    hovered={this.state.hovered}
                    onUpdateVisualizationSetting={(...args) => console.log("onUpdateVisualizationSetting", args)}
                    onHoverChange={this.onHoverChange}
                    onRenderError={this.onRenderError}
                    onRender={this.onRender}
                />
            );
        }
    }
}
