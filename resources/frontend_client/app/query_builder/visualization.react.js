'use strict';
/*global cx, CardRenderer, PopoverWithTrigger, QueryVisualizationTable, QueryVisualizationChart*/

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var QueryVisualization = React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        setDisplayFn: React.PropTypes.func.isRequired,
        setChartColorFn: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            maxTableRows: 500,
            visualizationTypes: [
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
            ]
        };
    },

    getInitialState: function() {
        return {
            origQuery: JSON.stringify(this.props.card.dataset_query)
        };
    },

    componentWillReceiveProps: function(nextProps) {
        // whenever we are told that we are running a query lets update our understanding of the "current" query
        if (nextProps.isRunning) {
            this.setState({
                origQuery: JSON.stringify(nextProps.card.dataset_query)
            });
        }
    },

    queryIsDirty: function() {
        // a query is considered dirty if ANY part of it has been changed
        return (JSON.stringify(this.props.card.dataset_query) !== this.state.origQuery);
    },

    hasLatitudeAndLongitudeColumns: function(columnDefs) {
        var hasLatitude = false,
            hasLongitude = false;
        columnDefs.forEach(function(col, index) {
            if (col.special_type &&
                    col.special_type === "latitude") {
                hasLatitude = true;

            } else if (col.special_type &&
                    col.special_type === "longitude") {
                hasLongitude = true;
            }
        });

        return (hasLatitude && hasLongitude);
    },

    isSensibleChartDisplay: function(display) {
        var data = (this.props.result) ? this.props.result.data : null;

        if (display === "table") {
            // table is always appropriate
            return true;

        } else if (display === "scalar" && data &&
                    data.rows && data.rows.length === 1 &&
                    data.cols && data.cols.length === 1) {
            // a 1x1 data set is appropriate for a scalar
            return true;

        } else if (display === "pin_map" && data && this.hasLatitudeAndLongitudeColumns(data.cols)) {
            // when we have a latitude and longitude a pin map is cool
            return true;

        } else if ((display === "line" || display === "area") && data &&
                    data.rows && data.rows.length > 1 &&
                    data.cols && data.cols.length > 1) {
            // if we have 2x2 or more then that's enough to make a line/area chart
            return true;

        } else if (this.isChartDisplay(display) && data &&
                    data.cols && data.cols.length > 1) {
            // general check for charts is that they require 2 columns
            return true;
        }

        return false;
    },

    isChartDisplay: function(display) {
        return (display !== "table" && display !== "scalar");
    },

    setDisplay: function(event) {
        // notify our parent about our change
        this.props.setDisplayFn(event.target.value);
    },

    setChartColor: function(color) {
        // tell parent about our new color
        this.props.setChartColorFn(color);
    },

    renderChartColorPicker: function() {
        if (this.props.card.display === "line" || this.props.card.display === "area" || this.props.card.display === "bar") {
            var colors = this.props.visualizationSettingsApi.getDefaultColorHarmony();
            var colorItems = [];
            for (var i=0; i < colors.length; i++) {
                var color = colors[i];
                var localStyles = {
                    "backgroundColor": color
                };

                colorItems.push((
                    <li key={i} className="CardSettings-colorBlock" style={localStyles} onClick={this.setChartColor.bind(null, color)}></li>
                ));
            }

            var colorPickerButton = "chart color";

            var tetherOptions = {
                attachment: 'bottom left',
                targetAttachment: 'top right',
                targetOffset: '14px 0'
            };

            return (
                <PopoverWithTrigger className="PopoverBody"
                                    tetherOptions={tetherOptions}
                                    triggerElement={colorPickerButton}>
                    <ol className="p1">
                        {colorItems}
                    </ol>
                </PopoverWithTrigger>
            );

        } else {
            return false;
        }
    },

    renderVizControls: function() {
        if (this.props.result && this.props.result.error === undefined) {
            var displayOptions = [];
            for (var i = 0; i < this.props.visualizationTypes.length; i++) {
                var val = this.props.visualizationTypes[i];

                if (this.isSensibleChartDisplay(val)) {
                    displayOptions.push(
                        <option key={i} value={val}>{val}</option>
                    );
                } else {
                    // NOTE: the key below MUST be different otherwise we get React errors, so we just append a '_' to it (sigh)
                    displayOptions.push(
                        <option key={i+'_'} value={val}>{val} (not sensible)</option>
                    );
                }
            }

            return (
                <div>
                    Show as:
                    <label className="Select ml2">
                        <select onChange={this.setDisplay} value={this.props.card.display}>
                            {displayOptions}
                        </select>
                    </label>
                    {this.renderChartColorPicker()}
                </div>
            );
        } else {
            return false;
        }
    },

    loader: function() {
        var animate = '<animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.8s" repeatCount="indefinite" />';
        return (
            <div className="Loading-indicator">
                <svg viewBox="0 0 32 32" width="32px" height="32px" fill="currentcolor">
                  <path opacity=".25" d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"/>
                  <path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z" dangerouslySetInnerHTML={{__html: animate}}></path>
                </svg>
            </div>
        );
    },

    render: function() {
        var viz,
            queryModified,
            rowMaxMessage;

        if (!this.props.result) {
            viz = (
                <div className="flex full layout-centered text-brand">
                    <h1>If you give me some data I can show you something cool.  Run a Query!</h1>
                </div>
            );
        } else {
            if (this.queryIsDirty()) {
                queryModified = (
                    <div className="flex mt2 layout-centered text-headsup">
                        <span className="Badge Badge--headsUp mr2">Heads up</span> The data below is out of date because your query has changed
                    </div>
                );
            }

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
                        <div className="Visualization--scalar flex full layout-centered">
                            <span>{scalarValue}</span>
                        </div>
                    );

                } else if (this.props.card.display === "table") {
                    if(this.props.result.data.rows.length > this.props.maxTableRows) {
                        rowMaxMessage = (
                            <div className="mt1">
                                <span className="Badge Badge--headsUp mr2">Too many rows to display!</span>
                                Previewing <b>{this.props.maxTableRows}</b> of <b>{this.props.result.data.rows.length}</b> total.
                            </div>
                        );
                    }

                    viz = (
                        <QueryVisualizationTable
                            data={this.props.result.data}
                            maxRows={this.props.maxTableRows} />
                    );

                } else {
                    // assume that anything not a table is a chart
                    viz = (
                        <QueryVisualizationChart
                            visualizationSettingsApi={this.props.visualizationSettingsApi}
                            card={this.props.card}
                            data={this.props.result.data} />
                    );
                }
            }
        }

        var loading;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex flex-column layout-centered text-brand">
                    {this.loader()}
                    <h2 className="Loading-message text-brand text-uppercase mt3">Doing science...</h2>
                </div>
            );
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
                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {queryModified}
                </ReactCSSTransitionGroup>
                {loading}
                <ReactCSSTransitionGroup className={visualizationClasses} transitionName="animation-viz">
                    {viz}
                </ReactCSSTransitionGroup>
                <div className="VisualizationSettings QueryBuilder-section clearfix">
                    <div className="float-right">
                        {rowMaxMessage}
                    </div>
                    {this.renderVizControls()}
                </div>
            </div>
        );
    }
});
