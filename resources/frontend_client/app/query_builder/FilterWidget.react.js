'use strict';

import _ from "underscore";

import Icon from "metabase/components/Icon.react";
import FieldName from './FieldName.react';
import Popover from "metabase/components/Popover.react";
import FilterPopover from "./filters/FilterPopover.react";

import Query from "metabase/lib/query";
import moment from 'moment';

import cx from "classnames";

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
            isOpen: this.props.filter[0] == undefined
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

    hasField: function() {
        return Query.isValidField(this.state.field);
    },

    hasOperator: function() {
        return (typeof this.state.operator === "string");
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
                onClick={this.open}
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
            <div className={classes} onClick={this.open}>
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
                    <div key={valueIndex} className={filterSectionClasses} onClick={this.open}>
                        <span className={cx(queryOptionClasses)}>{valueString}</span>
                    </div>
                );
            }
        });
    },

    open: function() {
        this.setState({ isOpen: true });
    },

    close: function() {
        this.setState({ isOpen: false });
    },

    renderPopover: function() {
        if (this.state.isOpen) {
            var tetherOptions = {
                attachment: 'top left',
                targetAttachment: 'bottom left',
                targetOffset: '10px 0'
            };

            return (
                <Popover
                    ref="filterPopover"
                    className="PopoverBody PopoverBody--withArrow FilterPopover"
                    isInitiallyOpen={this.state.field === null}
                    tetherOptions={tetherOptions}
                    onClose={this.close}
                >
                    <FilterPopover
                        filter={this.props.filter}
                        tableMetadata={this.props.tableMetadata}
                        onCommitFilter={(filter) => this.props.updateFilter(this.props.index, filter)}
                        onClose={this.close}
                    />
                </Popover>
            );
        }
    },

    render: function() {
        var classes = cx({
            "Query-filter": true,
            "px1": true,
            "selected": this.state.isOpen
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
