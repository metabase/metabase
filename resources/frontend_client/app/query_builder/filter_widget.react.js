'use strict';
/*global _*/

import DateFilter from './date_filter.react';
import Icon from './icon.react';
import FieldSelector from './field_selector.react';
import SelectionModule from './selection_module.react';
import PopoverWithTrigger from './popover_with_trigger.react';

import Query from './query';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'FilterWidget',
    propTypes: {
        filter: React.PropTypes.array.isRequired,
        tableMetadata: React.PropTypes.object.isRequired,
        index: React.PropTypes.number.isRequired,
        updateFilter: React.PropTypes.func.isRequired,
        removeFilter: React.PropTypes.func.isRequired
    },

    componentWillMount: function() {
        this.componentWillReceiveProps(this.props);
    },

    componentWillReceiveProps: function(newProps) {
        var operator = newProps.filter[0],      // name of the operator
            field = newProps.filter[1],         // id of the field
            values = null;                       // filtering value

        if (newProps.filter.length > 2) {
            values = [];

            for (var i=2; i < newProps.filter.length; i++) {
                var valuesIdx = i - 2;

                values[valuesIdx] = null;
                if (newProps.filter[i] !== null) {
                    // always cast the underlying value to a string, otherwise we get strange behavior on dealing with input
                    values[valuesIdx] = newProps.filter[i].toString();
                }
            }
        }

        // if we know what field we are filtering by we can extract the fieldDef to help us with filtering choices
        var fieldDef
        if (Array.isArray(field)) {
            var fkDef = newProps.tableMetadata.fields_lookup[field[1]];
            if (fkDef) {
                fieldDef = fkDef.target.table.fields_lookup[field[2]];
            }
        } else {
            fieldDef = newProps.tableMetadata.fields_lookup[field];
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
        // it also filters out values like NULL which we don't want in our value options
        if (fieldValues && fieldValues.values) {
            var safeValues = [];
            for (var idx2 in fieldValues.values) {
                var fieldValue = fieldValues.values[idx2];

                var safeValue = {};
                for(var key in fieldValue) {
                    // NOTE: we specifically prevent any keys which are NULL values because those should be expressed using IS_NULL or NOT_NULL operators
                    if (fieldValue[key] !== undefined && fieldValue[key] !== null) {
                        safeValue[key] = fieldValue[key].toString();
                    }
                }

                if (Object.getOwnPropertyNames(safeValue).length > 0) {
                    safeValues.push(safeValue);
                }
            }

            fieldValues.values = safeValues;
        }

        this.setState({
            field: field,
            operator: operator,
            operatorList: operatorList,
            values: values,
            fieldValues: fieldValues,
            fieldDef: fieldDef
        });
    },

    hasField: function() {
        return (typeof this.state.field === "number") || this.state.field && (typeof this.state.field[2] === "number");
    },

    setField: function(value, index, filterListIndex) {
        // whenever the field is set we completely clear the filter and reset it, this is because some operators and values don't
        // make sense once you've changed the field, so starting fresh is the most sensible thing to do
        if (!_.isEqual(this.state.field, value)) {
            var filter = [null, value, null];
            this.props.updateFilter(this.props.index, filter);
        }
        if (Query.isValidField(value)) {
            this.refs.popover.toggleModal();
        }
    },

    setOperator: function(value, index, filterListIndex) {
        // different operators will lead to different filter scenarios, so handle that here
        var operatorInfo = this.state.fieldDef.operators_lookup[value];
        var filter = this.props.filter;

        if (operatorInfo.validArgumentsFilters.length !== this.props.filter.length) {
            // looks like our new filter operator expects a different length filter from our current
            filter = [];
            for(var i=0; i < operatorInfo.validArgumentsFilters.length + 2; i++) {
                filter[i] = null;
            }

            // anything after 2 positions is going to be variable
            for (var j=0; j < filter.length; j++) {
                if (this.props.filter.length >= j+1) {
                    filter[j] = this.props.filter[j];
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

        if (value && value.length > 0) {
            // value casting.  we need the value in the filter to be of the proper type
            if (this.state.fieldDef.special_type === "timestamp_milliseconds" ||
                this.state.fieldDef.special_type === "timestamp_seconds") {
            } else if (this.state.fieldDef.base_type === "IntegerField" ||
                    this.state.fieldDef.base_type === "SmallIntegerField" ||
                    this.state.fieldDef.base_type === "BigIntegerField") {
                value = parseInt(value);
            } else if (this.state.fieldDef.base_type === "BooleanField") {
                value = (value.toLowerCase() === "true") ? true : false;
            } else if (this.state.fieldDef.base_type === "FloatField" ||
                        this.state.fieldDef.base_type === "DecimalField") {
                value = parseFloat(value);
            }

            // TODO: we may need to do some date formatting work on DateTimeField and DateField
        } else {
            value = null;
        }

        if (value !== undefined) {
            filter[index] = value;
            this.props.updateFilter(this.props.index, filter);
        }
    },

    setDateValue: function (index, date) {
        this.setValue(date.format('YYYY-MM-DD'), index, this.props.index);
    },

    setTextValue: function(index) {
        var value = this.refs.textFilterValue.getDOMNode().value;
        // we always know the index will be 2 for the value of a filter
        this.setValue(value, index, this.props.index);
    },

    removeFilterFn: function() {
        this.props.removeFilter(this.props.index);
    },

    renderFieldList: function() {
        var tetherOptions = {
            attachment: 'top center',
            targetAttachment: 'bottom left',
            targetOffset: '10px 25px'
        };

        var targetTitle, fkTitle, fkIcon;
        var field = this.state.field;
        if (Array.isArray(field)) {
            var fkDef = this.props.tableMetadata.fields_lookup[field[1]];
            var targetDef = fkDef && fkDef.target.table.fields_lookup[field[2]];
            targetTitle = targetDef && (<span>{targetDef.display_name}</span>);
            fkTitle = fkDef && (<span>{fkDef.display_name}</span>);
            fkIcon = fkDef && targetDef && (<span className="px1"><Icon name="connections" width="10" height="10" /></span>);
        } else {
            var targetDef = this.props.tableMetadata.fields_lookup[field];
            targetTitle = targetDef && (<span>{targetDef.display_name}</span>);
        }

        var classes = cx({
            'Filter-section': true,
            'Filter-section-field': true,
            'selected': this.hasField(),
            'px1': true,
            'pt1': true
        });
        var triggerElement;
        if (fkTitle || targetTitle) {
            triggerElement = (
                <div className={classes}>
                    <span className="QueryOption">{fkTitle}{fkIcon}{targetTitle}</span>
                </div>
            );
        } else {
            triggerElement = (
                <div className={classes}>
                    <span className="QueryOption">Field</span>
                </div>
            );
        }
        return (
            <PopoverWithTrigger ref="popover"
                                className="PopoverBody PopoverBody--withArrow"
                                isInitiallyOpen={this.state.field === null}
                                tetherOptions={tetherOptions}
                                triggerElement={triggerElement}
                                triggerClasses="flex align-center">
                <FieldSelector
                    field={this.state.field}
                    tableMetadata={this.props.tableMetadata}
                    setField={this.setField}
                />
            </PopoverWithTrigger>
        );
    },

    renderOperatorList: function() {
        // if we don't know our field yet then don't render anything
        if (!this.hasField()) {
            return false;
        }

        return (
            <SelectionModule
                className="Filter-section Filter-section-operator"
                placeholder="operator"
                items={this.state.operatorList}
                display='verbose_name'
                selectedValue={this.state.operator}
                selectedKey='name'
                index={0}
                isInitiallyOpen={this.state.operator === null}
                parentIndex={this.props.index}
                action={this.setOperator}
            />
        );
    },

    renderFilterValue: function() {
        // if we don't know our field AND operator yet then don't render anything
        if (!this.hasField() || this.state.operator === null) {
            return false;
        }

        // the first 2 positions of the filter are always for fieldId + fieldOperator
        var numValues = this.props.filter.length - 2;

        var filterValueInputs = [];
        for (var i=0; i < numValues; i++) {
            var filterIndex = i + 2;
            var filterValue = this.state.values[i];

            var valueHtml;
            if(this.state.fieldValues) {
                if(this.state.fieldValues.values) {
                    valueHtml = (
                        <SelectionModule
                            key={i}
                            className="Filter-section Filter-section-value"
                            action={this.setValue}
                            display='name'
                            index={filterIndex}
                            items={this.state.fieldValues.values}
                            isInitiallyOpen={filterValue === null && i === 0}
                            placeholder="value"
                            selectedValue={filterValue}
                            selectedKey='key'
                            parentIndex={this.props.index}
                        />
                    );
                } else {
                    switch(this.state.fieldValues.type) {
                        case 'date':
                            valueHtml = (
                                <div key={i} className="Filter-section Filter-section-value">
                                    <DateFilter
                                        date={filterValue}
                                        index={filterIndex}
                                        onChange={this.setDateValue}
                                    />
                                </div>
                            );
                            break;
                        default:
                            valueHtml = (
                                <div key={i} className="Filter-section Filter-section-value">
                                    <input
                                        className="QueryOption input px1"
                                        type="text"
                                        value={filterValue}
                                        onChange={this.setTextValue.bind(null, filterIndex)}
                                        ref="textFilterValue"
                                        placeholder="What value?"
                                    />
                                </div>
                            );
                    }
                }
            }

            filterValueInputs[i] = valueHtml;
        }

        return filterValueInputs;
    },

    render: function() {
        return (
            <div className="Query-filter">
                <div>
                    <div>
                        {this.renderFieldList()}
                    </div>
                    <div className="flex align-center">
                        {this.renderOperatorList()}
                        {this.renderFilterValue()}
                    </div>
                </div>
                <a className="text-grey-2 no-decoration pr1 flex align-center" href="#" onClick={this.removeFilterFn}>
                    <Icon name='close' width="14px" height="14px" />
                </a>
            </div>
        );
    }
});
