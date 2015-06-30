'use strict';

import { CardRenderer } from '../card/card.charting';
import Icon from './icon.react';
import PopoverWithTrigger from './popover_with_trigger.react';
import QueryVisualizationTable from './visualization_table.react';
import QueryVisualizationChart from './visualization_chart.react';
import QueryVisualizationObjectDetailTable from './visualization_object_detail_table.react';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        setDisplayFn: React.PropTypes.func.isRequired,
        setChartColorFn: React.PropTypes.func.isRequired,
        setSortFn: React.PropTypes.func.isRequired,
        cellIsClickableFn: React.PropTypes.func,
        cellClickedFn: React.PropTypes.func
    },

    visualizationTypeNames: {
        'scalar': 'Number',
        'table': 'Table',
        'line': 'Line',
        'bar': 'Bar',
        'pie': 'Pie',
        'area': 'Area',
        'state': 'State map',
        'country': 'Country map',
        'pin_map': 'Pin map'
    },

    getDefaultProps: function() {
        return {
            // NOTE: this should be more dynamic from the backend, it's set based on the query lang
            maxTableRows: 2000,
            visualizationTypes: [
                'scalar',
                'table',
                'line',
                'bar',
                'pie',
                'area',
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
        switch (display) {
            case "table":
                // table is always appropriate
                return true;
            case "scalar":
                // a 1x1 data set is appropriate for a scalar
                return (data && data.rows && data.rows.length === 1 && data.cols && data.cols.length === 1);
            case "pin_map":
                // when we have a latitude and longitude a pin map is cool
                return (data && this.hasLatitudeAndLongitudeColumns(data.cols));
            case "line":
            case "area":
                // if we have 2x2 or more then that's enough to make a line/area chart
                return (data && data.rows && data.rows.length > 1 && data.cols && data.cols.length > 1);
            case "country":
            case "state":
                return (data && data.cols && data.cols.length > 1 && data.cols[0].base_type === "TextField");
            case "bar":
            case "pie":
            default:
                // general check for charts is that they require 2 columns
                return (data && data.cols && data.cols.length > 1);
        }
    },

    isChartDisplay: function(display) {
        return (display !== "table" && display !== "scalar");
    },

    setDisplay: function(type) {
        // notify our parent about our change
        this.props.setDisplayFn(type);
    },

    setChartColor: function(color) {
        // tell parent about our new color
        this.props.setChartColorFn(color);
    },

    renderChartTypePicker: function() {
        var tetherOptions = {
            attachment: 'bottom center',
            targetAttachment: 'top center',
            targetOffset: '-25px 0'
        };
        var chartTypeButton = (
                <div className="inline-block">
                    <span className="ChartType-button text-brand text-brand-hover shadowed flex layout-centered">
                        <Icon name="star" width="18px" height="18px"></Icon>
                    </span>
                </div>
        );

        var displayOptions = this.props.visualizationTypes.map((type, index) => {
            var classes = cx({
                'p2': true,
                'ChartType--selected': type === this.props.card.display,
                'ChartType--notSensible': !this.isSensibleChartDisplay(type),
                'flex': true,
                'align-center': true,
                'cursor-pointer': true,
                'bg-brand-hover': true,
                'text-white-hover': true,
            });
            var name = this.visualizationTypeNames[type] || type;
            console.log(name);
            var iconName = name.replace(/\s+/g, '').toLowerCase();
            return (
                <li className={classes} key={index} onClick={this.setDisplay.bind(null, type)}>
                    <Icon name={iconName} width="18px" height="18px"/>
                    <span className="ml1">{name}</span>
                </li>
            );
        });
        return (
            <span className="flex align-center">
                Visualize as
                <PopoverWithTrigger className="PopoverBody ChartType-popover"
                                    tetherOptions={tetherOptions}
                                    triggerElement={chartTypeButton}>
                    <ul className="">
                        {displayOptions}
                    </ul>
                </PopoverWithTrigger>
            </span>
        );
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

            var colorPickerButton = (
                <a className="Button">
                    Change color
                </a>
            );

            var tetherOptions = {
                attachment: 'middle left',
                targetAttachment: 'middle right',
                targetOffset: '0 12px'
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

    clickedForeignKey: function(fk) {
        this.props.followForeignKeyFn(fk);
    },

    renderFooter: function(tableFootnote) {
        if (this.props.isObjectDetail) {
            if (!this.props.tableForeignKeys) return false;

            var component = this;
            var relationships = this.props.tableForeignKeys.map(function(fk) {
                var relationName = (fk.origin.table.entity_name) ? fk.origin.table.entity_name : fk.origin.table.name;
                return (
                    <li className="block mb1 lg-mb2">
                        <a className="QueryOption inline-block no-decoration p2 lg-p2" key={fk.id} href="#" onClick={component.clickedForeignKey.bind(null, fk)}>
                            {relationName}
                        </a>
                    </li>
                )
            });

            return (
                <div className="VisualizationSettings wrapper QueryBuilder-section clearfix">
                    <h3 className="mb1 lg-mb2">Relationships:</h3>
                    <ul>
                        {relationships}
                    </ul>
                </div>
            );

        } else {
            var vizControls;
            if (this.props.result && this.props.result.error === undefined) {
                vizControls = (
                    <div>
                        {this.renderChartTypePicker()}
                        {this.renderChartColorPicker()}
                    </div>
                );
            }

            return (
                <div className="VisualizationSettings wrapper flex">
                    {vizControls}
                    <div className="flex-align-right">
                        {tableFootnote}
                    </div>
                </div>
            );
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
        var loading,
            viz,
            queryModified,
            tableFootnote;

        if(this.props.isRunning) {
            loading = (
                <div className="Loading absolute top left bottom right flex flex-column layout-centered text-brand">
                    {this.loader()}
                    <h2 className="Loading-message text-brand text-uppercase mt3">Doing science...</h2>
                </div>
            );
        }

        if (!this.props.result) {
            viz = (
                <div className="flex full layout-centered text-grey-1">
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
                if (this.props.isObjectDetail) {
                    viz = (
                        <QueryVisualizationObjectDetailTable
                            data={this.props.result.data}
                            cellIsClickableFn={this.props.cellIsClickableFn}
                            cellClickedFn={this.props.cellClickedFn} />
                    );

                } else if (this.props.result.data.rows.length === 0) {
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
                    // when we are displaying a data grid, setup a footnote which provides some row information
                    if (this.props.result.data.rows_truncated ||
                            (this.props.card.dataset_query.type === "query" &&
                                this.props.card.dataset_query.query.aggregation[0] === "rows" &&
                                this.props.result.data.rows.length === 2000)) {
                        tableFootnote = (
                            <div className="mt1">
                                <span className="Badge Badge--headsUp mr2">Too many rows!</span>
                                Result data was capped at <b>{this.props.result.row_count}</b> rows.
                            </div>
                        );
                    } else {
                        tableFootnote = (
                            <div className="mt1">
                                Showing <b>{this.props.result.row_count}</b> rows.
                            </div>
                        );
                    }

                    var sort = (this.props.card.dataset_query.query && this.props.card.dataset_query.query.order_by) ?
                                    this.props.card.dataset_query.query.order_by : null;
                    viz = (
                        <QueryVisualizationTable
                            data={this.props.result.data}
                            maxRows={this.props.maxTableRows}
                            setSortFn={this.props.setSortFn}
                            sort={sort}
                            cellIsClickableFn={this.props.cellIsClickableFn}
                            cellClickedFn={this.props.cellClickedFn}
                        />
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

                // check if the query result was truncated and let the user know about it if so
                if (this.props.result.data.rows_truncated && !tableFootnote) {
                    tableFootnote = (
                        <div className="mt1">
                            <span className="Badge Badge--headsUp mr2">Too many rows!</span>
                            Result data was capped at <b>{this.props.result.data.rows_truncated}</b> rows.
                        </div>
                    );
                }
            }
        }

        var wrapperClasses = cx({
            'relative': true,
            'full': true,
            'flex': !this.props.isObjectDetail,
            'flex-column': !this.props.isObjectDetail
        });

        var visualizationClasses = cx({
            'Visualization': true,
            'Visualization--errors': (this.props.result && this.props.result.error),
            'Visualization--loading': this.props.isRunning,
            'wrapper': true,
            'full': true,
            'flex': true,
            'flex-full': true,
            'QueryBuilder-section': true,
            'pt2 lg-pt4': true
        });

        return (
            <div className={wrapperClasses}>
                {queryModified}
                {loading}
                <div className={visualizationClasses}>
                    {viz}
                </div>
                {this.renderFooter(tableFootnote)}
            </div>
        );
    }
});
