'use strict';
/* jshint ignore:start */
var cx = React.addons.classSet,
    ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var QueryBuilder = React.createClass({
    displayName: 'QueryBuilder',
    propTypes: {
        model: React.PropTypes.object.isRequired
    },
    _getFilterFields: function () {
        var filterFieldList = [];
        if(this.props.model.selected_table_fields) {
            for(var key in this.props.model.selected_table_fields.fields_lookup) {
                filterFieldList.push(this.props.model.selected_table_fields.fields_lookup[key]);
            }
        }
        return filterFieldList;
    },
    _getFilterWidget: function (filter, index) {
        var operator = filter[0], // name of the operator
            field = filter[1], // id of the field
            value = filter[2],

            operatorList = [],
            valueFields,
            filterFieldList = this._getFilterFields();

        // extract the real info
        for(var fieldItem in filterFieldList) {
            var theField = filterFieldList[fieldItem];

            if(theField.id == field) {

                for(var operatorItem in theField.operators_lookup) {
                    var theOperator = theField.operators_lookup[operatorItem]
                    // push the operator into the list we'll use for selection
                    operatorList.push(theOperator);

                    if(theOperator.name == operator) {
                    // this is structured strangely
                        valueFields = theOperator.fields[0];
                    }
                }
            }
        }

        return (
            <FilterWidget
                placeholder="Item"
                field={field}
                filterFieldList={filterFieldList}
                operator={operator}
                operatorList={operatorList}
                value={value}
                valueFields={valueFields}
                index={index || 0}
                remove={this.props.model.removeFilter.bind(this.props.model)}
                updateFilter={this.props.model.updateFilter.bind(this.props.model)}
            />
        );
    },
    render: function () {
        var runButton,
            runButtonText,
            filterHtml,
            filterList;

        // populate the list of possible filterable fields

        var filters = this.props.model.card.dataset_query.query.filter;

        // if we have filters...
        if(filters.length != 0) {
            // and if we have multiple filters, map through and return a filter widget
            if(filters[0] == 'AND') {
                filterList = this.props.model.card.dataset_query.query.filter.map(function (filter, index) {
                    if(filter == 'AND') {
                        return
                    } else {
                        return (
                            this._getFilterWidget(filter, index)
                        )
                    }
                }.bind(this))
            } else {
                filterList = this._getFilterWidget(filters)
            }
        }

        if(this.props.model.canRun()) {
            if(this.props.model.isRunning) {
                runButtonText = "Loading..."
            } else {
                runButtonText = "Find out!"
            }
            runButton = (
                <a className="ActionButton ActionButton--primary float-right"onClick={this.props.model.run.bind(this.props.model)}>{runButtonText}</a>
            )

            filterHtml = (
                <div className="clearfix">
                    <a className="FilterTrigger float-left ActionButton inline-block mr4" onClick={this.props.model.addFilter.bind(this.props.model)}>
                        <svg className="icon" width="16px" height="16px" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z"></path>
                        </svg>
                    </a>
                    {filterList}
                </div>
            )
        }

        var queryPickerClasses = cx({
            'QueryPicker-group': true
        });

        var saver,
            result,
            download;
        if(this.props.model.result) {
            saver = (
                <Saver
                    save={this.props.model.save.bind(this.props.model)}
                    name={this.props.model.card.name}
                    description={this.props.model.card.description}
                    hasChanged={this.props.model.hasChanged}
                    setPermissions={this.props.model.setPermissions.bind(this.props.model)}
                    permissions={this.props.model.card.public_perms}
                />
            );
            result = (
                <QueryVisualization
                    card={this.props.model.card}
                    result={this.props.model.result}
                    setDisplay={this.props.model.setDisplay.bind(this.props.model)}
                />
            );
            download = (
                <a className="ActionButton inline-block mr1" href={this.props.model.getDownloadLink()} target="_blank">Download data</a>
            );
        }



        return (
            <div className="full-height">
                    <div className="QueryHeader">
                        <div className="QueryWrapper">
                            <div className="inline-block">
                                <QueryHeader
                                    name={this.props.model.card.name}
                                    user={this.props.model.user}
                                />
                            </div>
                        </div>
                    </div>
                    <div className={queryPickerClasses}>
                        <div>
                            <div className="QueryWrapper">
                                <div className="clearfix">
                                    {runButton}
                                    <QueryPicker
                                        dbList={this.props.model.database_list}
                                        setDatabase={this.props.model.setDatabase.bind(this.props.model)}
                                        db={this.props.model.card.dataset_query.database}
                                        options={this.props.model.selected_table_fields}
                                        tables={this.props.model.table_list}
                                        aggregationFieldList={this.props.model.aggregation_field_list}
                                        query={this.props.model.card.dataset_query.query}
                                        setSourceTable={this.props.model.setSourceTable.bind(this.props.model)}
                                        setAggregation={this.props.model.setAggregation.bind(this.props.model)}
                                        setAggregationTarget={this.props.model.setAggregationTarget.bind(this.props.model)}
                                        addDimension={this.props.model.addDimension.bind(this.props.model)}
                                        removeDimension={this.props.model.removeDimension.bind(this.props.model)}
                                        updateDimension={this.props.model.updateDimension.bind(this.props.model)}
                                        aggregationComplete={this.props.model.aggregationComplete.bind(this.props.model)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="QueryWrapper my2">
                                {filterHtml}
                            </div>
                        </div>
                    </div>

                    <div className="QueryWrapper mb4">
                        {result}
                    </div>

                    <div className="ActionBar">
                        {saver}
                        {download}
                    </div>
            </div>
        )
    }
});

/* jshint ignore:end */
