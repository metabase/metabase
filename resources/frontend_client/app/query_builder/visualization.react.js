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

    isChartDisplay: function(display) {
        return (display !== "table" && display !== "scalar");
    },

    setDisplay: function (event) {
        // notify our parent about our change
        this.props.setDisplayFn(event.target.value);
    },

    renderVizControls: function () {
        if (this.props.result && this.props.result.error === undefined) {
            var types = [
                'scalar',
                'table',
                'line',
                'bar',
                'pie',
                'area',
                'timeseries',
                'state',
                'country',
                'pin_map'
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
                        <select onChange={this.setDisplay} value={this.props.card.display}>
                            {displayOptions}
                        </select>
                    </label>
                </div>
            );
        } else {
            return false;
        }
    },

    svg: function () {
        return'<svg viewBox="0 0 32 32" width="32px" height="32px" fill="red">' +
                      '<path opacity=".25" d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"/>' +
                      '<path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z">' +
                        '<animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.8s" repeatCount="indefinite" />' +
                      '</path>' +
                    '</svg>'
    },

    render: function () {
        var viz;
        if (!this.props.result) {
            viz = (
                <div className="QueryError flex full align-center text-brand">
                    <div className="QueryError-iconWrapper">
                        <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                            <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                        </svg>
                    </div>
                    <span className="QueryError-message">If you give me some data I can show you something cool.  Run a Query!</span>
                </div>
            );
        } else {
            if (this.props.result.error) {
                viz = (
                    <div className="QueryError flex full align-center text-error">
                        <div className="QueryError-iconWrapper">
                            <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                            </svg>
                        </div>
                        <span className="QueryError-message">{this.props.result.error}</span>
                    </div>
                );

            } else if (this.props.result.data) {
                if (this.props.result.data.rows.length === 0) {
                    // successful query but there were 0 rows returned with the result
                    viz = (
                        <div className="QueryError flex full align-center text-brand">
                            <div className="QueryError-iconWrapper">
                                <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                                    <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                                </svg>
                            </div>
                            <span className="QueryError-message">Doh! We ran your query but it returned 0 rows of data.</span>
                        </div>
                    );

                } else if (this.props.card.display === "scalar") {
                    var scalarValue;
                    if (this.props.result.data.rows &&
                        this.props.result.data.rows.length > 0 &&
                        this.props.result.data.rows[0].length > 0) {
                        scalarValue = this.props.result.data.rows[0][0];
                    }

                    viz = (
                        <div className="Visualization--scalar flex full align-center">
                            <span>{scalarValue}</span>
                        </div>
                    );

                } else if (this.props.card.display === "table") {
                    viz = (
                        <QueryVisualizationTable
                            data={this.props.result.data}
                            maxRows={500} />
                    );

                } else {
                    // assume that anything not a table is a chart
                    viz = (
                        <QueryVisualizationChart
                            card={this.props.card}
                            data={this.props.result.data} />
                    );
                }
            }
        }

        var loading;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex align-center">
                    <span dangerouslySetInnerHtml={{__html: this.svg()}}></span>
                    <span className="Loading-message text-brand text-uppercase">Loading...</span>
                </div>
            )
        }

        var visualizationClasses = cx({
            'Visualization': true,
            'Visualization--errors': (this.props.result && this.props.result.error),
            'Visualization--loading': this.props.isRunning,
            'full': true,
            'flex': true,
            'flex-full': true,
            'QueryBuilder-section': true
        });

        return (
            <div className="relative full flex flex-column">
                {loading}
                <ReactCSSTransitionGroup className={visualizationClasses} transitionName="animation-viz">
                    {viz}
                </ReactCSSTransitionGroup>
                {this.renderVizControls()}
            </div>
        );
    }
});
