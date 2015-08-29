"use strict";

import VisualizationChart from "metabase/query_builder/visualization_chart.react.js";

export default class ChartCard extends React.Component {
    render() {
        return (
            <VisualizationChart
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
    card: React.PropTypes.object.isRequired,
    data: React.PropTypes.object.isRequired,
    visualizationSettingsApi: React.PropTypes.object.isRequired
};
