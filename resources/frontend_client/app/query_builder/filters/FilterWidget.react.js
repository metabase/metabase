'use strict';

import Icon from "metabase/components/Icon.react";
import FieldName from '../FieldName.react';
import Popover from "metabase/components/Popover.react";
import FilterPopover from "./FilterPopover.react";

import Query from "metabase/lib/query";
import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { isDate } from "metabase/lib/schema_metadata";

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
        let { filter } = newProps;
        let [operator, field, ...values] = filter;

        let target = Query.getFieldTarget(field, newProps.tableMetadata);
        let fieldDef = target && target.field;
        let operatorDef = fieldDef && fieldDef.operators_lookup[operator];

        if (!operatorDef) {
            operatorDef = fieldDef && fieldDef.operators_lookup['='];
        }

        this.setState({
            field: field,
            fieldDef: fieldDef,
            operator: operator,
            operatorDef: operatorDef,
            values: values
        });
    },

    removeFilterFn: function() {
        this.props.removeFilter(this.props.index);
    },

    open: function() {
        this.setState({ isOpen: true });
    },

    close: function() {
        this.setState({ isOpen: false });
    },

    renderField: function() {
        return (
            <FieldName
                className="Filter-section Filter-section-field"
                field={this.state.field}
                fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                onClick={this.open}
            />
        );
    },

    renderOperator: function() {
        var { operatorDef } = this.state;
        return (
            <div className="SelectionModule Filter-section Filter-section-operator" onClick={this.open}>
                <a className="QueryOption p1 flex align-center">{operatorDef && operatorDef.verbose_name}</a>
            </div>
        );
    },

    renderValues: function() {
        let { operatorDef, fieldDef, values } = this.state;

        if (operatorDef.multi && values.length > 1) {
            values = [values.length + " selections"];
        }

        if (isDate(fieldDef)) {
            values = generateTimeFilterValuesDescriptions(this.props.filter);
        }

        // the first 2 positions of the filter are always for fieldId + fieldOperator
        return values.map((value, valueIndex) => {
            var valueString = value != null ? value.toString() : null;
            return (
                <div key={valueIndex} className="Filter-section Filter-section-value" onClick={this.open}>
                    <span className="QueryOption">{valueString}</span>
                </div>
            );
        });
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
                <div className="ml1">
                    <div className="flex align-center">
                        {this.renderField()}
                        {this.renderOperator()}
                    </div>
                    <div className="flex align-center">
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
