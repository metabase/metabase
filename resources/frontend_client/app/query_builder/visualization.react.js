'use strict';
/*global cx, CardRenderer*/

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var QueryVisualization = React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        setDisplayFn: React.PropTypes.func.isRequired
    },
    getInitialState: function () {
        return {
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },
    componentDidMount: function () {
        this.renderChartIfNeeded();
    },
    componentDidUpdate: function () {
        this.renderChartIfNeeded();
    },
    isTableDisplay: function (display) {
        return (display === "table" || display === "scalar");
    },
    renderChartIfNeeded: function () {
        if (!this.isTableDisplay(this.props.card.display) && this.props.result) {
            // TODO: it would be nicer if this didn't require the whole card
            CardRenderer[this.props.card.display](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    setDisplay: function (event) {
        // notify our parent about our change
        this.props.setDisplayFn(event.target.value);
    },
    renderChartVisualization: function () {
        // rendering a chart of some type
        var titleId = 'card-title--'+this.state.chartId;
        var innerId = 'card-inner--'+this.state.chartId;

        return (
            <div className="Card--{this.props.card.display} Card-outer px1" id={this.state.chartId}>
                <div id={titleId} className="text-centered"></div>
                <div id={innerId} className="card-inner"></div>
            </div>
        );
    },
    renderVizControls: function () {
        if (this.props.result.error === undefined) {
            var types = [
                'table',
                'line',
                'bar',
                'pie',
                'area',
                'timeseries'
            ];

            var displayOptions = [];
            for (var i = 0; i < types.length; i++) {
                var val = types[i];
                displayOptions.push(
                    <option key={i} value={val}>{val}</option>
                );
            };

            return (
                <div className="VisualizationSettings QueryBuilder-section">
                    Show as:
                    <label className="Select">
                        <select onChange={this.setDisplay}>
                            {displayOptions}
                        </select>
                    </label>
                </div>
            );
        } else {
            return false;
        }
    },
    renderLoading: function () {
        return {
            __html: '<svg viewBox="0 0 32 32" width="32px" height="32px" fill="red">' +
                      '<path opacity=".25" d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"/>' +
                      '<path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z">' +
                        '<animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.8s" repeatCount="indefinite" />' +
                      '</path>' +
                    '</svg>'
        }
    },
    render: function () {
        if(!this.props.result) {
            return false;
        }

        var viz;
        if(this.props.isRunning) {
            // we have to use dangerouslySetInnerHtml here cause react is treating 'animateTransform' as a react component 
           viz = (
                <div dangerouslySetInnerHtml={this.renderLoading()}></div>
           )   
        } else {
            if(this.props.result.error) {
                viz = (
                    <div className="QueryError flex align-center">
                        <span className="QueryError-message">{this.props.result.error}</span>
                    </div>
                );
    
            } else if(this.props.result.data) {
                if(this.isTableDisplay(this.props.card.display)) {
                    viz = (
                        <QueryVisualizationTable data={this.props.result.data} />
                    );
                } else {
                    // assume that anything not a table is a chart
                    viz = this.renderChartVisualization();
                }
            }
        }

        var visualizationClasses = cx({
            'Visualization': true,
            'Visualization--errors': this.props.result.error,
            'Visualization--loading': this.props.isRunning,
            'full': true,
            'flex': true,
            'flex-full': true,
            'QueryBuilder-section': true, 

        });

        return (
            <div className="full flex flex-column">
                <ReactCSSTransitionGroup className={visualizationClasses} transitionName="animation-viz">
                    {viz}
                </ReactCSSTransitionGroup>
                {this.renderVizControls()}
            </div>
        );
    }
});
