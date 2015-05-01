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
        var operator = newProps.filter[0],            // name of the operator
            field = newProps.filter[1],               // id of the field
            value,                                      // filtering value
            operatorList = [],
            valueFields;

        if (newProps.filter.length > 2) {
            value = newProps.filter[2];
        }

        // extract the real info
        var fieldDef;
        for(var fieldItem in newProps.filterFieldList) {
            var theField = newProps.filterFieldList[fieldItem];
            if(theField.id === field) {
                fieldDef = theField;
                for(var operatorItem in theField.operators_lookup) {
                    var theOperator = theField.operators_lookup[operatorItem]
                    // push the operator into the list we'll use for selection
                    operatorList.push(theOperator);

                    if(theOperator.name === operator) {
                        // this is structured strangely
                        valueFields = theOperator.fields[0];
                    }
                }
            }
        }

        this.setState({
            field: field,
            operator: operator,
            operatorList,
            value: value,
            valueFields: valueFields,
            fieldDef: fieldDef
        });
    },

    isOpen: function(value) {
        if (value !== undefined) {
            return true;
        } else {
            return false;
        }
    },

    setField: function(value, index, filterListIndex) {
        // field is always the first item in our filter array
        var filter = this.props.filter;
        filter[1] = value;
        this.props.updateFilter(this.props.index, filter);
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

        // TODO: value casting
        console.log(this.state.fieldDef);
        if (this.state.fieldDef.base_type === "IntegerField") {
            value = parseInt(value);
        }

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
                    isInitiallyOpen={this.isOpen()}
                    parentIndex={this.props.index}
                />
            </div>
        );
    },

    renderOperatorList: function() {
        return (
            <div className={this.sectionClassName}>
                <SelectionModule
                    placeholder="..."
                    items={this.state.operatorList}
                    display='verbose_name'
                    selectedValue={this.state.operator}
                    selectedKey='name'
                    index={0}
                    isInitiallyOpen={this.isOpen()}
                    parentIndex={this.props.index}
                    action={this.setOperator}
                />
            </div>
        );
    },

    getSafeValues: function() {
        return this.state.valueFields.values.map(function(value) {
            var safeValues = {};
            for(var key in value) {
                // TODO: what typing issues can we run into here?
                //       we used to call toString() on these values
                safeValues[key] = value[key];
            }
            return safeValues;
        });
    },

    renderFilterValue: function() {
        var valueHtml,
            isOpen = true;

        if(this.state.valueFields) {

            if(this.state.valueFields.values) {
                // do some fixing up of the values so we can display true / false without causing "return true" or "return false"
                var values = this.getSafeValues();

                if(this.state.value) {
                    isOpen = false;
                }

                valueHtml = (
                    <SelectionModule
                        action={this.setValue}
                        display='name'
                        index='2'
                        items={values}
                        isInitiallyOpen={isOpen}
                        placeholder="..."
                        selectedValue={this.state.value}
                        selectedKey='key'
                        parentIndex={this.props.index}
                    />
                );
            } else {
                switch(this.state.valueFields.type) {
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
