'use strict';
/*global _*/

import Calendar from './calendar.react';
import Icon from "metabase/components/Icon.react";
import FieldName from './field_name.react';
import FieldSelector from './field_selector.react';
import SelectionModule from './selection_module.react';
import Popover from "metabase/components/Popover.react";
import ColumnarSelector from "metabase/components/ColumnarSelector.react";

import Query from "metabase/lib/query";
import moment from 'moment';

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

    getInitialState: function() {
        return {
            currentPane: this.props.filter[0] == undefined ? 0 : -1
        };
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

        var fieldOptions = Query.getFieldOptions(newProps.tableMetadata.fields, true);

        this.setState({
            field: field,
            operator: operator,
            operatorList: operatorList,
            values: values,
            fieldValues: fieldValues,
            fieldDef: fieldDef,
            fieldOptions: fieldOptions
        });
    },

    isVisible: function() {
        return this.state.currentPane >= 0 && this.state.currentPane < this.props.filter.length
    },

    selectPane: function(index) {
        this.setState({ currentPane: index });
    },

    hasField: function() {
        return Query.isValidField(this.state.field);
    },

    hasOperator: function() {
        return (typeof this.state.operator === "string");
    },

    setField: function(value) {
        // whenever the field is set we completely clear the filter and reset it, this is because some operators and values don't
        // make sense once you've changed the field, so starting fresh is the most sensible thing to do
        if (!_.isEqual(this.state.field, value)) {
            var filter = [null, value, null];
            this.props.updateFilter(this.props.index, filter);
        }
        if (Query.isValidField(value)) {
            this.selectPane(1);
        }
    },

    setOperator: function(value) {
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

        this.selectPane(2);
    },

    setValue: function(index, value) {
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
            filter[index + 2] = value;
            this.props.updateFilter(this.props.index, filter);
        }

        var nextPane = index + 2 + 1;
        if (nextPane < filter.length) {
            this.selectPane(nextPane);
        } else {
            this.selectPane(-1);
        }
    },

    setDateValue: function (index, date) {
        this.setValue(index, date.format('YYYY-MM-DD'));
    },

    setTextValue: function(index) {
        var value = this.refs.textFilterValue.getDOMNode().value;
        // we always know the index will be 2 for the value of a filter
        this.setValue(index, value);
    },

    removeFilterFn: function() {
        this.props.removeFilter(this.props.index);
    },

    renderField: function() {
        var classes = cx({
            'Filter-section': true,
            'Filter-section-field': true,
            'px1': true,
            'pt1': true
        });

        return (
            <FieldName
                className={classes}
                field={this.state.field}
                fieldOptions={this.state.fieldOptions}
                onClick={this.selectPane.bind(null, 0)}
            />
        );
    },

    renderOperator: function() {
        var operator;
        // if we don't know our field yet then don't render anything
        if (this.hasField()) {
            operator = _.find(this.state.operatorList, (o) => o.name === this.state.operator);
        }
        var operatorName = operator ? operator.verbose_name : "operator";

        var classes = cx({
            "SelectionModule": true,
            "Filter-section": true,
            "Filter-section-operator": true,
            "selected": !!operator
        })
        return (
            <div className={classes} onClick={this.selectPane.bind(null, 1)}>
                <a className="QueryOption p1 flex align-center">{operatorName}</a>
            </div>
        );
    },

    renderValues: function() {
        // if we don't know our field AND operator yet then don't render anything
        if (!this.hasField() || this.state.operator === null) {
            return false;
        }

        // the first 2 positions of the filter are always for fieldId + fieldOperator
        return this.props.filter.slice(2).map((filterValue, valueIndex) => {
            var filterIndex = valueIndex + 2;
            var value = this.state.values[valueIndex];
            if (this.state.fieldValues) {
                var filterSectionClasses = cx({
                    "Filter-section": true,
                    "Filter-section-value": true,
                    "selected": filterValue != null
                });
                var queryOptionClasses = {};
                queryOptionClasses["QueryOption"] = true
                queryOptionClasses["QueryOption--" + this.state.fieldValues.type] = true;
                var valueString;
                if (this.state.fieldValues.type === "date") {
                    valueString = value ? moment(value).format("MMMM D, YYYY") : "date";
                } else {
                    valueString = value != null ? value.toString() : "value";
                }
                return (
                    <div key={valueIndex} className={filterSectionClasses} onClick={this.selectPane.bind(null, filterIndex)}>
                        <span className={cx(queryOptionClasses)}>{valueString}</span>
                    </div>
                );
            }
        });
    },

    renderFieldPane: function() {
        return (
            <FieldSelector
                field={this.state.field}
                fieldOptions={this.state.fieldOptions}
                tableName={this.props.tableMetadata.display_name}
                setField={this.setField}
            />
        );
    },

    renderOperatorPane: function() {
        var column = {
            selectedItem: _.find(this.state.operatorList, (o) => o.name === this.state.operator),
            items: this.state.operatorList,
            itemTitleFn: (o) => o.verbose_name,
            itemSelectFn: (o, index) => this.setOperator(o.name, index)
        };
        return (
            <ColumnarSelector columns={[column]} />
        );
    },

    renderValuePane: function(valueIndex) {
        if (this.state.fieldValues && this.state.values && valueIndex <= this.state.values.length) {
            var value = this.state.values[valueIndex];
            if (this.state.fieldValues.values) {
                var column = {
                    selectedItem: _.find(this.state.fieldValues.values, (v) => v.key === value),
                    items: this.state.fieldValues.values,
                    itemTitleFn: (v) => v.name,
                    itemSelectFn: (v, index) => this.setValue(valueIndex, v.key)
                };
                return (
                    <ColumnarSelector columns={[column]} />
                );
            } else if (this.state.fieldValues.type === "date") {
                var date = value ? moment(value) : moment();
                return (
                    <div className="flex full-height layout-centered m2">
                        <Calendar
                            selected={date}
                            onChange={this.setDateValue.bind(null, valueIndex)}
                        />
                    </div>
                );
            } else {
                return (
                    <div className="Filter-section Filter-section-value flex p2">
                        <input
                            className="QueryOption input mx1 flex-full"
                            type="text"
                            defaultValue={value}
                            ref="textFilterValue"
                            placeholder="What value?"
                            autoFocus={true}
                        />
                        <button className="Button mx1 text-default text-normal" onClick={() => this.setTextValue(valueIndex, this.refs.textFilterValue.value)}>
                            Add
                        </button>
                    </div>
                );
            }
        }
        return <div><div>{value}</div><pre>{JSON.stringify(this.state.fieldValues)}</pre></div>;
    },

    renderPopover: function() {
        if (this.isVisible()) {
            var pane;
            if (this.state.currentPane === 0) {
                pane = this.renderFieldPane();
            } else if (this.state.currentPane === 1) {
                pane = this.renderOperatorPane();
            } else {
                pane = this.renderValuePane(this.state.currentPane - 2);
            }

            var tabs = [
                { name: "Field", enabled: true },
                { name: "Operator", enabled: this.hasField() }
            ];

            var numValues = this.props.filter.length - 2;
            for (var i = 0; i < numValues; i++) {
                tabs.push({ name: "Value", enabled: this.hasField() && this.state.operator != null });
            }

            var tetherOptions = {
                attachment: 'top left',
                targetAttachment: 'bottom left',
                targetOffset: '10px 0'
            };

            return (
                <Popover
                    ref="popover"
                    className="PopoverBody PopoverBody--withArrow FilterPopover"
                    isInitiallyOpen={this.state.field === null}
                    tetherOptions={tetherOptions}
                    handleClickOutside={this.selectPane.bind(null, -1)}
                >
                    <ul className="PopoverHeader">
                        {tabs.map((t, index) => {
                            var classes = cx({
                                "PopoverHeader-item": true,
                                "PopoverHeader-item--withArrow": index < tabs.length,
                                "cursor-pointer": t.enabled,
                                "selected": this.state.currentPane === index,
                                "disabled": !t.enabled
                            });
                            return <li key={index} className={classes} onClick={this.selectPane.bind(null, index)}>{t.name}</li>
                        })}
                    </ul>
                    <div>{pane}</div>
                </Popover>
            );
        }
    },

    render: function() {
        var classes = cx({
            "Query-filter": true,
            "px1": true,
            "selected": this.isVisible()
        });
        return (
            <div className={classes}>
                <div>
                    <div>
                        {this.renderField()}
                    </div>
                    <div className="flex align-center">
                        {this.renderOperator()}
                        {this.renderValues()}
                    </div>
                    {this.renderPopover()}
                </div>
                <a className="text-grey-2 no-decoration px1 flex align-center" href="#" onClick={this.removeFilterFn}>
                    <Icon name='close' width="14px" height="14px" />
                </a>
            </div>
        );
    }
});
