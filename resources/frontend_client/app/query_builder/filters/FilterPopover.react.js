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
        this.commitFilter = this.commitFilter.bind(this);
    }

    commitFilter() {
        this.props.onCommitFilter(this.state.filter);
        this.props.onClose();
    }

    setField(fieldId) {
        let { filter } = this.state;

        // update the field
        filter[1] = fieldId;

        // default to the first operator
        let { field } = this.getTarget(filter);
        filter[0] = field.valid_operators[0].name;

        this.setState({ filter, pane: "filter" });
    }

    setOperator(operator) {
        let { filter } = this.state;
        if (filter[0] !== operator) {
            filter[0] = operator;
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

    isValid() {
        let { filter } = this.state;
        return filter[0] != null && Query.isValidField(filter[1]);
    }

    renderPicker(field, operator) {
        return operator.fields.map((operatorField, index) => {
            if (operatorField.type === "select") {
                return (
                    <SelectPicker
                        options={operatorField.values}
                        values={this.state.filter.slice(2)}
                        setValues={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            } else if (operatorField.type === "text") {
                return (
                    <TextPicker
                        values={this.state.filter.slice(2)}
                        setValues={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            } else if (operatorField.type === "number") {
                return (
                    <NumberPicker
                        values={this.state.filter.slice(2)}
                        setValues={this.setValues}
                        multi={operator.multi}
                        index={index}
                    />
                );
            } else if (operatorField.type === "date") {
                return (
                    <DatePicker />
                )
            }
            return <span>not implemented {operatorField.type} {operator.multi ? "true" : "false"}</span>;
        });
    }

    getTarget(filter) {
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
            let { table, field } = this.getTarget(filter);
            let selectedOperator = field.operators_lookup[filter[0]];

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
                        { selectedOperator && this.renderPicker(field, selectedOperator) }
                    </div>
                    <div className="FilterPopover-footer p1">
                        <button className={cx("Button", "Button--purple", "full", { "disabled": !this.isValid() })} onClick={this.commitFilter}>
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
