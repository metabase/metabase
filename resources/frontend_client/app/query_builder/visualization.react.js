'use strict';

var QueryVisualization = React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        result: React.PropTypes.object.isRequired,
        visualization: React.PropTypes.string.isRequired
    },
    getInitialState: function () {
        return {
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },
    componentDidMount: function () {
        if (this.props.visualization !== 'table') {
            CardRenderer[this.props.visualization](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    componentDidUpdate: function () {
        if (this.props.visualization !== 'table') {
            CardRenderer[this.props.visualization](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    render: function () {
        var viz;

        if(this.props.result && this.props.result.data) {
            if(this.props.visualization != 'table') {
                // TODO - we should be able to render a chart without this :( 
                var titleId = 'card-title--'+this.state.chartId;
                var innerId = 'card-inner--'+this.state.chartId;
                viz = (
                    <div class="Card--{this.state.type} Card-outer px1" id={this.state.chartId}>
                        <div id={titleId} class="text-centered"></div>
                        <div id={innerId} class="card-inner"></div>
                    </div>
                );
            } else {
                viz = (
                    <div className="Table-wrapper">
                        <FixedTable
                            columns={this.props.result.data.columns}
                            rows={this.props.result.data.rows}
                        />
                    </div>
                );
            }
        }

        return (
            <div>
                {viz}
            </div>
        );
    }
});
