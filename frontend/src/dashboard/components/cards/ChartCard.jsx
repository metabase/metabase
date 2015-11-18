import React, { Component, PropTypes } from "react";

import QueryVisualizationChart from "metabase/query_builder/QueryVisualizationChart.jsx";

export default class ChartCard extends Component {
    static propTypes = {
        card: PropTypes.object.isRequired,
        data: PropTypes.object.isRequired,
        visualizationSettingsApi: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    render() {
        return (
            <QueryVisualizationChart
                card={this.props.card}
                data={this.props.data}
                visualizationSettingsApi={this.props.visualizationSettingsApi}
            />
        );
    }
}
