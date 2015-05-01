'use strict';
/*global DateFilter, SelectionModule*/

var FilterWidget = React.createClass({
    displayName: 'FilterWidget',
    propTypes: {
        filter: React.PropTypes.array.isRequired,
        filterFieldList: React.PropTypes.array.isRequired,
        index: React.PropTypes.number.isRequired,
        updateFilter: React.PropTypes.func.isRequired,
        removeFilter: React.PropTypes.func.isRequired
    },
    sectionClassName: 'Filter-section',

    componentWillMount: function() {
        this.componentWillReceiveProps(this.props);
    },

    componentWillReceiveProps: function(newProps) {
        var operator = newProps.filter[0],      // name of the operator
            field = newProps.filter[1],         // id of the field
            value = null;                       // filtering value

        if (newProps.filter.length > 2) {
            if (newProps.filter[2] !== null) {
                // always cast the underlying value to a string, otherwise we get strange behavior on dealing with input
                value = newProps.filter[2].toString();
            }
        }

        // if we know what field we are filtering by we can extract the fieldDef to help us with filtering choices
        var fieldDef;
        for(var idx in newProps.filterFieldList) {
            if(newProps.filterFieldList[idx].id === field) {
                fieldDef = newProps.filterFieldList[idx];
            }
        }

        // once we know our field we can pull out the list of possible operators to filter on
        // also, if we know the operator then we can pull out the possible values for the field (if available)
        // TODO: why is fieldValues a function of the operator?
        var operatorList = [],
            fieldValues;
        if (fieldDef) {
            for(var idx in fieldDef.operators_lookup) {
                var operatorDef = fieldDef.operators_lookup[idx];
                operatorList.push(operatorDef);

                if(operatorDef.name === operator) {
                    // this is structured strangely
                    fieldValues = operatorDef.fields[0];
                }
            }
        }

        // this converts our fieldValues into things that are safe for us to work with through HTML
        if (fieldValues && fieldValues.values) {
            fieldValues.values = fieldValues.values.map(function(value) {
                var safeValues = {};
                for(var key in value) {
                    // TODO: what typing issues can we run into here?
                    //       we used to call toString() on these values
                    safeValues[key] = value[key].toString();
                }
                return safeValues;
            });
        }

        this.setState({
            field: field,
            operator: operator,
            operatorList,
            value: value,
            fieldValues: fieldValues,
            fieldDef: fieldDef
        });
    },

    setField: function(value, index, filterListIndex) {
        // whenever the field is set we completely clear the filter and reset it, this is because some operators and values don't
        // make sense once you've changed the field, so starting fresh is the most sensible thing to do
        if (this.state.value !== value) {
            var filter = [null, value, null];
            this.props.updateFilter(this.props.index, filter);
        }
    },

    setOperator: function(value, index, filterListIndex) {
        // different operators will lead to different filter scenarios, so handle that here
        var operatorInfo = this.state.fieldDef.operators_lookup[value];
        var filter = this.props.filter;

        if (operatorInfo.validArgumentsFilters.length !== this.props.filter.length) {
            // looks like our new filter operator expects a different length filter from our current
            filter = [];
            for(var i = 0; i < operatorInfo.validArgumentsFilters.length + 2; i++) {
                filter[i] = null;
            }

            // anything after 2 positions is going to be variable
            for (var i=0; i < filter.length; i++) {
                if (this.props.filter.length >= i+1) {
                    filter[i] = this.props.filter[i];
                }
            }

            // make sure we set the updated operator
            filter[0] = value;

        } else {
            filter[0] = value;
        }

        this.props.updateFilter(this.props.index, filter);
    },

    setValue: function(value, index, filterListIndex) {
        var filter = this.props.filter;

        // value casting.  we need the value in the filter to be of the proper type
        if (this.state.fieldDef.base_type === "IntegerField") {
            value = parseInt(value);
        } else if (this.state.fieldDef.base_type === "BooleanField") {
            value = (value.toLowerCase() === "true") ? true : false;
        } else if (this.state.fieldDef.base_type === "FloatField") {
            value = parseFloat(value);
        }

        // TODO: we may need to do some date formatting work on DateTimeField and DateField

        filter[index] = value;
        this.props.updateFilter(this.props.index, filter);
    },

    setTextValue: function(index) {
        var value = this.refs.textFilterValue.getDOMNode().value;
        // we always know the index will be 2 for the value of a filter
        this.setValue(value, 2, index);
    },

    renderFieldList: function() {
        return (
            <div className={this.sectionClassName}>
                <SelectionModule
                    action={this.setField}
                    display='name'
                    index={1}
                    items={this.props.filterFieldList}
                    placeholder="Filter by..."
                    selectedValue={this.state.field}
                    selectedKey='id'
                    isInitiallyOpen={this.state.field === null}
                    parentIndex={this.props.index}
                />
            </div>
        );
    },

    renderOperatorList: function() {
        // if we don't know our field yet then don't render anything
        if (this.state.field === null) {
            return false;
        }

        return (
            <div className={this.sectionClassName}>
                <SelectionModule
                    placeholder="..."
                    items={this.state.operatorList}
                    display='verbose_name'
                    selectedValue={this.state.operator}
                    selectedKey='name'
                    index={0}
                    isInitiallyOpen={this.state.operator === null}
                    parentIndex={this.props.index}
                    action={this.setOperator}
                />
            </div>
        );
    },

    renderFilterValue: function() {
        // if we don't know our field AND operator yet then don't render anything
        if (this.state.field === null || this.state.operator === null) {
            return false;
        }

        var valueHtml;
        if(this.state.fieldValues) {
            if(this.state.fieldValues.values) {
                valueHtml = (
                    <SelectionModule
                        action={this.setValue}
                        display='name'
                        index='2'
                        items={this.state.fieldValues.values}
                        isInitiallyOpen={this.state.value === null}
                        placeholder="..."
                        selectedValue={this.state.value}
                        selectedKey='key'
                        parentIndex={this.props.index}
                    />
                );
            } else {
                switch(this.state.fieldValues.type) {
                    case 'date':
                        valueHtml = (
                            <DateFilter
                                date={this.state.value}
                                onChange={
                                    function (date) {
                                        this.setValue(
                                            date.format('YYYY-MM-DD'),
                                            2,
                                            this.props.index
                                        );
                                    }.bind(this)
                                }
                            />
                        );
                        break;
                    default:
                        valueHtml = (
                            <input
                                className="input"
                                type="text"
                                defaultValue={this.state.value}
                                onChange={this.setTextValue.bind(null, this.props.index)}
                                ref="textFilterValue"
                                placeholder="What value?"
                            />
                        );
                }
            }
        }
        return (
            <div className="FilterSection">
                {valueHtml}
            </div>
        );
    },

    render: function() {
        return (
            <div className="Query-filter rounded">
                {this.renderFieldList()}
                {this.renderOperatorList()}
                {this.renderFilterValue()}
                <a onClick={this.props.removeFilter.bind(null, this.props.index)}>
                    <CloseIcon width="16px" height="16px" />
                </a>
            </div>
        );
    }
});
