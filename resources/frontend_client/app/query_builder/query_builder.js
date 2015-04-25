'use strict';
/* jshint ignore:start */
var cx = React.addons.classSet,
    ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var QueryBuilder = React.createClass({
    displayName: 'QueryBuilder',
    propTypes: {
        model: React.PropTypes.object.isRequired
    },
    render: function () {
        return (
            <div className="full-height">
                <div className="QueryHeader full">
                    <div className="QueryWrapper">
                        <QueryHeader
                            card={this.props.model.card}
                            save={this.props.model.save.bind(this.props.model)}
                            setQueryModeFn={this.props.model.setQueryMode}
                            downloadLink={this.props.model.getDownloadLink()}
                        />
                    </div>
                </div>
                <div className="QueryPicker-group">
                    <div className="QueryWrapper">
                        <div className="clearfix">
                            <GuiQueryEditor
                                dbList={this.props.model.database_list}
                                setDatabase={this.props.model.setDatabase.bind(this.props.model)}
                                db={this.props.model.card.dataset_query.database}
                                options={this.props.model.selected_table_fields}
                                tables={this.props.model.table_list}
                                selected_table_fields={this.props.model.selected_table_fields}
                                aggregationFieldList={this.props.model.aggregation_field_list}
                                query={this.props.model.card.dataset_query.query}
                                setSourceTable={this.props.model.setSourceTable.bind(this.props.model)}
                                setAggregation={this.props.model.setAggregation.bind(this.props.model)}
                                setAggregationTarget={this.props.model.setAggregationTarget.bind(this.props.model)}
                                addDimension={this.props.model.addDimension.bind(this.props.model)}
                                removeDimension={this.props.model.removeDimension.bind(this.props.model)}
                                updateDimension={this.props.model.updateDimension.bind(this.props.model)}
                                aggregationComplete={this.props.model.aggregationComplete.bind(this.props.model)}
                                addFilter={this.props.model.addFilter}
                                updateFilter={this.props.model.updateFilter}
                                removeFilter={this.props.model.removeFilter}
                                canRun={this.props.model.canRun()}
                                isRunning={this.props.model.isRunning}
                                runFn={this.props.model.run}
                            />
                        </div>
                    </div>
                </div>
                <div className="QueryWrapper mb4">
                    <QueryVisualization
                        card={this.props.model.card}
                        result={this.props.model.result}
                        setDisplay={this.props.model.setDisplay.bind(this.props.model)}
                    />
                </div>
            </div>
        );
    }
});

/* jshint ignore:end */
