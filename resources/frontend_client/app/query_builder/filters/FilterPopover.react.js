"use strict";

import React, { Component, PropTypes } from "react";

import FieldList from "./FieldList.react";
import OperatorSelector from "./OperatorSelector.react";
import SelectPicker from "./pickers/SelectPicker.react";
import TextPicker from "./pickers/TextPicker.react";
import NumberPicker from "./pickers/NumberPicker.react";
import DatePicker from "./pickers/DatePicker.react";

import Icon from "metabase/components/Icon.react";

import Query from "metabase/lib/query";
import * as SchemaMetadata from "metabase/lib/schema_metadata";

import cx from "classnames";

export default class FilterPopover extends Component {
    constructor(props) {
        super(props);

        this.state = {
            filter: (props.isNew ? [] : props.filter),
            pane: props.isNew ? "field" : "filter"
        };

        this.setField = this.setField.bind(this);
        this.setOperator = this.setOperator.bind(this);
        this.setValues = this.setValues.bind(this);
        this.setFilter = this.setFilter.bind(this);
        this.commitFilter = this.commitFilter.bind(this);
    }

    componentDidUpdate() {
        console.log("FILTER", this.state.filter);
    }

    commitFilter() {
        this.props.onCommitFilter(this.state.filter);
        this.props.onClose();
    }

    setField(fieldId) {
        let { filter } = this.state;
        if (filter[1] !== fieldId) {
            // different field, reset the filter
            filter = [];

            // update the field
            filter[1] = fieldId;

            // default to the first operator
            let { field } = this._getTarget(filter);
            let operator = field.valid_operators[0].name;

            filter = this._updateOperator(filter, operator);
        }
        this.setState({ filter, pane: "filter" });
    }

    setFilter(filter) {
        this.setState({ filter });
    }

    setOperator(operator) {
        let { filter } = this.state;
        if (filter[0] !== operator) {
            filter = this._updateOperator(filter, operator);
            this.setState({ filter });
        }
    }

    setValue(index, value) {
        let { filter } = this.state;
        filter[index + 2] = value;
        this.setState({ filter: filter });
    }

    setValues(values) {
        let { filter } = this.state;
        this.setState({ filter: filter.slice(0,2).concat(values) });
    }

    _updateOperator(filter, operatorName) {
        let { field } = this._getTarget(filter);
        let operator = field.operators_lookup[operatorName];

        // update the operator
        filter = [operatorName, filter[1]];

        if (operator) {
            for (var i = 0; i < operator.fields.length; i++) {
                filter.push(undefined);
            }
        }
        return filter;
    }

    _getTarget(filter) {
        let table, fieldId, field, fk;
        if (Array.isArray(filter[1]) && filter[1][0] === "fk->") {
            fk = this.props.tableMetadata.fields_lookup[filter[1][1]];
            table = fk.target.table;
            fieldId = filter[1][2];
        } else {
            table = this.props.tableMetadata;
            fieldId = filter[1];
        }
        field = table.fields_lookup[fieldId];
        return { table, field };
    }

    isValid() {
        let { filter } = this.state;
        // has an operator name and field id
        if (filter[0] == null || !Query.isValidField(filter[1])) {
            return false;
        }
        // field/operator combo is valid
        let { field } = this._getTarget(filter);
        let operator = field.operators_lookup[filter[0]];
        if (operator) {
            // has the mininum number of arguments
            if (filter.length - 2 < operator.fields.length) {
                return false;
            }
        }
        // arguments are non-null/undefined
        for (var i = 2; i < filter.length; i++) {
            if (filter[i] == null) {
                return false;
            }
        }

        return true;
    }

    renderPicker(filter, field) {
        let operator = field.operators_lookup[filter[0]];

        // HACK: special case for dates
        if (SchemaMetadata.isDate(field)) {
            return (
                <DatePicker
                    filter={this.state.filter}
                    onFilterChange={this.setFilter}
                />
            );
        }

        return operator.fields.map((operatorField, index) => {
            if (operatorField.type === "select") {
                return (
                    <SelectPicker
                        options={operatorField.values}
                        values={this.state.filter.slice(2)}
                        onValuesChange={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            } else if (operatorField.type === "text") {
                return (
                    <TextPicker
                        values={this.state.filter.slice(2)}
                        onValuesChange={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            } else if (operatorField.type === "number") {
                return (
                    <NumberPicker
                        values={this.state.filter.slice(2)}
                        onValuesChange={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            }
            return <span>not implemented {operatorField.type} {operator.multi ? "true" : "false"}</span>;
        });
    }

    render() {
        let { filter } = this.state;
        if (this.state.pane === "field") {
            return (
                <div className="FilterPopover">
                    <FieldList
                        field={this.state.filter[1]}
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                        tableName={this.props.tableMetadata.display_name}
                        setField={this.setField}
                    />
                </div>
            );
        } else {
            let { filter } = this.state;
            let { table, field } = this._getTarget(filter);

            return (
                <div style={{width: 300}}>
                    <div className="FilterPopover-header text-grey-3 p1 mt1 flex align-center">
                        <a className="cursor-pointer flex align-center" onClick={() => this.setState({ pane: "field" })}>
                            <Icon name="chevronleft" width="18" height="18"/>
                            <h3 className="inline-block">{table.display_name}</h3>
                        </a>
                        <h3 className="mx1">-</h3>
                        <h3 className="text-default">{field.display_name}</h3>
                    </div>
                    <div>
                        <OperatorSelector
                            filter={filter}
                            field={field}
                            onOperatorChange={this.setOperator}
                        />
                        { this.renderPicker(filter, field) }
                    </div>
                    <div className="FilterPopover-footer p1">
                        <button className={cx("Button Button--purple full", { "disabled": !this.isValid() })} onClick={this.commitFilter}>
                            {this.props.isNew ? "Add filter" : "Update filter"}
                        </button>
                    </div>
                </div>
            );
        }
    }
}

FilterPopover.propTypes = {
    isNew: PropTypes.bool,
    filter: PropTypes.array,
    onCommitFilter: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

FilterPopover.defaultProps = {
};
