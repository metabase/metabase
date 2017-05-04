/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

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

import type { FieldFilter, ConcreteField, ExpressionClause } from "metabase/meta/types/Query";
import type { TableMetadata, FieldMetadata, Operator } from "metabase/meta/types/Metadata";

type Props = {
    filter?: FieldFilter,
    onCommitFilter: () => void,
    onClose: () => void,
    tableMetadata: TableMetadata,
    customFields: ExpressionClause
}

type State = {
    filter: FieldFilter
}

export default class FilterPopover extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);

        this.state = {
            // $FlowFixMe
            filter: props.filter || []
        };
    }

    static propTypes = {
        filter: PropTypes.array,
        onCommitFilter: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        window.addEventListener('keydown', this.commitOnEnter);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.commitOnEnter);
    }

    commitOnEnter = (event: KeyboardEvent) => {
        if(this.isValid() && event.key === "Enter") {
            this.commitFilter(this.state.filter);
        }
    }

    commitFilter = (filter: FieldFilter) => {
        this.props.onCommitFilter(filter);
        this.props.onClose();
    }

    setField = (fieldId: ConcreteField) => {
        let { filter } = this.state;
        if (filter[1] !== fieldId) {
            // different field, reset the filter
            filter = [];

            // update the field
            filter[1] = fieldId;

            // default to the first operator
            let { field } = Query.getFieldTarget(filter[1], this.props.tableMetadata);

            // let the DatePicker choose the default operator, otherwise use the first one
            let operator = isDate(field) ? null : field.operators[0].name;

            // $FlowFixMe
            filter = this._updateOperator(filter, operator);
        }
        this.setState({ filter });
    }

    setFilter = (filter: FieldFilter) => {
        this.setState({ filter });
    }

    setOperator = (operator: string) => {
        let { filter } = this.state;
        if (filter[0] !== operator) {
            filter = this._updateOperator(filter, operator);
            this.setState({ filter });
        }
    }

    setValue(index: number, value: any) {
        let { filter } = this.state;
        filter[index + 2] = value;
        this.setState({ filter: filter });
    }

    setValues = (values: any[]) => {
        let { filter } = this.state;
        // $FlowFixMe
        this.setState({ filter: filter.slice(0,2).concat(values) });
    }

    _updateOperator(oldFilter: FieldFilter, operatorName: ?string): FieldFilter {
        let { field } = Query.getFieldTarget(oldFilter[1], this.props.tableMetadata);
        let operator = field.operators_lookup[operatorName];
        let oldOperator = field.operators_lookup[oldFilter[0]];

        // update the operator
        // $FlowFixMe
        let filter: FieldFilter = [operatorName, oldFilter[1]];

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

    clearField = () => {
        let { filter } = this.state;
        // $FlowFixMe
        this.setState({ filter: [...filter.slice(0, 1), null, ...filter.slice(2)] });
    }

    renderPicker(filter: FieldFilter, field: FieldMetadata) {
        let operator: ?Operator = field.operators_lookup[filter[0]];
        return operator && operator.fields.map((operatorField, index) => {
            if (!operator) {
                return;
            }
            let values, onValuesChange;
            let placeholder = operator && operator.placeholders && operator.placeholders[index] || undefined;
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
                        onCommit={this.onCommit}
                    />
                );
            } else if (operatorField.type === "text") {
                return (
                    <TextPicker
                        values={values}
                        onValuesChange={onValuesChange}
                        placeholder={placeholder}
                        multi={operator.multi}
                        onCommit={this.onCommit}
                    />
                );
            } else if (operatorField.type === "number") {
                return (
                    <NumberPicker
                        values={values}
                        onValuesChange={onValuesChange}
                        placeholder={placeholder}
                        multi={operator.multi}
                        onCommit={this.onCommit}
                    />
                );
            }
            return <span>not implemented {operatorField.type} {operator.multi ? "true" : "false"}</span>;
        });
    }

    onCommit = () => {
        if (this.isValid()) {
            this.commitFilter(this.state.filter)
        }
    }

    render() {
        let { filter } = this.state;
        if (filter[0] === "SEGMENT" || filter[1] == undefined) {
            return (
                <div className="FilterPopover">
                    <FieldList
                        className="text-purple"
                        field={this.state.filter[1]}
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                        customFieldOptions={this.props.customFields}
                        segmentOptions={this.props.tableMetadata.segments && this.props.tableMetadata.segments.filter((sgmt) => sgmt.is_active === true)}
                        tableMetadata={this.props.tableMetadata}
                        onFieldChange={this.setField}
                        onFilterChange={this.commitFilter}
                    />
                </div>
            );
        } else {
            let { filter } = this.state;
            let { table, field } = Query.getFieldTarget(filter[1], this.props.tableMetadata);

            return (
                <div style={{
                    minWidth: 300
                }}>
                    <div className="FilterPopover-header text-grey-3 p1 mt1 flex align-center">
                        <a className="cursor-pointer flex align-center" onClick={this.clearField}>
                            <Icon name="chevronleft" size={18}/>
                            <h3 className="inline-block">{singularize(table.display_name)}</h3>
                        </a>
                        <h3 className="mx1">-</h3>
                        <h3 className="text-default">{field.display_name}</h3>
                    </div>
                    { isDate(field) ?
                        <DatePicker
                            className="mt1 border-top"
                            filter={filter}
                            onFilterChange={this.setFilter}
                        />
                    :
                        <div>
                            <OperatorSelector
                                operator={filter[0]}
                                operators={field.operators}
                                onOperatorChange={this.setOperator}
                            />
                            { this.renderPicker(filter, field) }
                        </div>
                    }
                    <div className="FilterPopover-footer p1">
                        <button
                            data-ui-tag="add-filter"
                            className={cx("Button Button--purple full", { "disabled": !this.isValid() })}
                            onClick={() => this.commitFilter(this.state.filter)}
                        >
                            {!this.props.filter ? "Add filter" : "Update filter"}
                        </button>
                    </div>
                </div>
            );
        }
    }
}
