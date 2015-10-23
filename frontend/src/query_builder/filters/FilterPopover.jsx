import React, { Component, PropTypes } from "react";

import FieldList from "../FieldList.jsx";
import OperatorSelector from "./OperatorSelector.jsx";

import DatePicker from "./pickers/DatePicker.jsx";
import NumberPicker from "./pickers/NumberPicker.jsx";
import SelectPicker from "./pickers/SelectPicker.jsx";
import TextPicker from "./pickers/TextPicker.jsx";

import Icon from "metabase/components/Icon.jsx";

import Query from "metabase/lib/query";
import { isDate } from "metabase/lib/schema_metadata";
import { singularize } from "metabase/lib/formatting";

import cx from "classnames";
import _ from "underscore";

export default class FilterPopover extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            filter: (props.isNew ? [] : props.filter)
        };

        _.bindAll(this, "setField", "clearField", "setOperator", "setValues", "setFilter", "commitFilter");
    }

    static propTypes = {
        isNew: PropTypes.bool,
        filter: PropTypes.array,
        onCommitFilter: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

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
            let { field } = Query.getFieldTarget(filter[1], this.props.tableMetadata);
            let operator = field.valid_operators[0].name;

            filter = this._updateOperator(filter, operator);
        }
        this.setState({ filter });
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

    _updateOperator(oldFilter, operatorName) {
        let { field } = Query.getFieldTarget(oldFilter[1], this.props.tableMetadata);
        let operator = field.operators_lookup[operatorName];
        let oldOperator = field.operators_lookup[oldFilter[0]];

        // update the operator
        let filter = [operatorName, oldFilter[1]];

        if (operator) {
            for (let i = 0; i < operator.fields.length; i++) {
                if (operator.defaults && operator.defaults[i] !== undefined) {
                    filter.push(operator.defaults[i]);
                } else {
                    filter.push(undefined);
                }
            }
            if (oldOperator) {
                // copy over values of the same type
                for (let i = 0; i < oldFilter.length - 2; i++) {
                    let field = operator.multi ? operator.fields[0] : operator.fields[i];
                    let oldField = oldOperator.multi ? oldOperator.fields[0] : oldOperator.fields[i];
                    if (field && oldField && field.type === oldField.type && oldFilter[i + 2] !== undefined) {
                        filter[i + 2] = oldFilter[i + 2];
                    }
                }
            }
        }
        return filter;
    }

    isValid() {
        let { filter } = this.state;
        // has an operator name and field id
        if (filter[0] == null || !Query.isValidField(filter[1])) {
            return false;
        }
        // field/operator combo is valid
        let { field } = Query.getFieldTarget(filter[1], this.props.tableMetadata);
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

    clearField() {
        let { filter } = this.state;
        filter[1] = null;
        this.setState({ filter });
    }

    renderPicker(filter, field) {
        let operator = field.operators_lookup[filter[0]];
        return operator && operator.fields.map((operatorField, index) => {
            let values, onValuesChange;
            let placeholder = operator.placeholders && operator.placeholders[index] || undefined;
            if (operator.multi) {
                values = this.state.filter.slice(2);
                onValuesChange = (values) => this.setValues(values);
            } else {
                values = [this.state.filter[2 + index]];
                onValuesChange = (values) => this.setValue(index, values[0]);
            }
            if (operatorField.type === "select") {
                return (
                    <SelectPicker
                        options={operatorField.values}
                        values={values}
                        onValuesChange={onValuesChange}
                        placeholder={placeholder}
                        multi={operator.multi}
                    />
                );
            } else if (operatorField.type === "text") {
                return (
                    <TextPicker
                        values={values}
                        onValuesChange={onValuesChange}
                        placeholder={placeholder}
                        multi={operator.multi}
                    />
                );
            } else if (operatorField.type === "number") {
                return (
                    <NumberPicker
                        values={values}
                        onValuesChange={onValuesChange}
                        placeholder={placeholder}
                        multi={operator.multi}
                    />
                );
            }
            return <span>not implemented {operatorField.type} {operator.multi ? "true" : "false"}</span>;
        });
    }

    render() {
        let { filter } = this.state;
        if (filter[1] == undefined) {
            return (
                <div className="FilterPopover">
                    <FieldList
                        field={this.state.filter[1]}
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                        tableMetadata={this.props.tableMetadata}
                        onFieldChange={this.setField}
                        className="text-purple"
                    />
                </div>
            );
        } else {
            let { filter } = this.state;
            let { table, field } = Query.getFieldTarget(filter[1], this.props.tableMetadata);

            return (
                <div style={{width: 300}}>
                    <div className="FilterPopover-header text-grey-3 p1 mt1 flex align-center">
                        <a className="cursor-pointer flex align-center" onClick={this.clearField}>
                            <Icon name="chevronleft" width="18" height="18"/>
                            <h3 className="inline-block">{singularize(table.display_name)}</h3>
                        </a>
                        <h3 className="mx1">-</h3>
                        <h3 className="text-default">{field.display_name}</h3>
                    </div>
                    { isDate(field) ?
                        <DatePicker
                            filter={filter}
                            onFilterChange={this.setFilter}
                            onOperatorChange={this.setOperator}
                            tableMetadata={this.props.tableMetadata}
                        />
                    :
                        <div>
                            <OperatorSelector
                                operator={filter[0]}
                                operators={field.valid_operators}
                                onOperatorChange={this.setOperator}
                            />
                            { this.renderPicker(filter, field) }
                        </div>
                    }
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
    tableMetadata: PropTypes.object.isRequired,
    isNew: PropTypes.bool,
    filter: PropTypes.array,
    onCommitFilter: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};
