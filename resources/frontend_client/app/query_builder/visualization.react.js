'use strict';

var QueryVisualization = React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        result: React.PropTypes.object.isRequired
    },
    getInitialState: function () {
        return {
            type: 'table',
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },
    componentDidMount: function () {
        if (this.state.type !== 'table') {
            CardRenderer[this.state.type](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    componentDidUpdate: function () {
        if (this.state.type !== 'table') {
            CardRenderer[this.state.type](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    _changeType: function (type) {
        this.setState({
            type: type
        });
        this.props.setDisplay(type);
    },
    render: function () {
        var viz;

        if(this.props.result && this.props.result.data) {
            if(this.state.type != 'table') {
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


        var types = [
            'table',
            'line',
            'bar',
            'pie',
            'area',
            'timeseries'
        ], typeControls = types.map(function (type) {
            if(this.props.result) {
                var buttonClasses = cx({
                    'Button': true,
                    'Button--primary' : (type == this.state.type)
                })
                return (
                    <a className={buttonClasses} href="#" onClick={this._changeType.bind(null, type)}>{type}</a>
                );
            } else {
                return false;
            }
        }.bind(this));

        return (
            <div>
                <div className="TypeControls">
                    <div className="wrapper">
                        {typeControls}
                    </div>
                </div>
                {viz}
            </div>
        );
    }
});
