import React, { Component, PropTypes } from "react";

import QueryVisualizationChart from "metabase/query_builder/QueryVisualizationChart.react.js";

export default class ChartCard extends Component {
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

ChartCard.defaultProps = {
    className: ""
};

ChartCard.propTypes = {
    card: PropTypes.object.isRequired,
    data: PropTypes.object.isRequired,
    visualizationSettingsApi: PropTypes.object.isRequired
};
