"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import FieldName from '../FieldName.react';
import Popover from "metabase/components/Popover.react";
import FilterPopover from "./FilterPopover.react";

import Query from "metabase/lib/query";
import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { isDate } from "metabase/lib/schema_metadata";

import cx from "classnames";
import _ from "underscore";

export default class FilterWidget extends Component {
    constructor(props) {
        super(props);

        this.state = {
            isOpen: this.props.filter[0] == undefined
        };

        _.bindAll(this, "open", "close", "removeFilter");
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
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
    }

    removeFilter() {
        this.props.removeFilter(this.props.index);
    }

    open() {
        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    renderField() {
        return (
            <FieldName
                className="Filter-section Filter-section-field"
                field={this.state.field}
                fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                onClick={this.open}
            />
        );
    }

    renderOperator() {
        var { operatorDef } = this.state;
        return (
            <div className="Filter-section Filter-section-operator" onClick={this.open}>
                &nbsp;
                <a className="QueryOption flex align-center">{operatorDef && operatorDef.moreVerboseName}</a>
            </div>
        );
    }

    renderValues() {
        let { operatorDef, fieldDef, values } = this.state;

        if (operatorDef.multi && values.length > 1) {
            values = [values.length + " selections"];
        }

        if (isDate(fieldDef)) {
            values = generateTimeFilterValuesDescriptions(this.props.filter);
        }

        return values.map((value, valueIndex) => {
            var valueString = value != null ? value.toString() : null;
            return (
                <div key={valueIndex} className="Filter-section Filter-section-value" onClick={this.open}>
                    <span className="QueryOption">{valueString}</span>
                </div>
            );
        });
    }

    renderPopover() {
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
    }

    render() {
        return (
            <div className={cx("Query-filter px1", { "selected": this.state.isOpen })}>
                <div className="ml1">
                    <div className="flex align-center" style={{"padding": "0.5em", "paddingTop": "0.3em", "paddingBottom": "0.3em"}}>
                        {this.renderField()}
                        {this.renderOperator()}
                    </div>
                    <div className="flex align-center">
                        {this.renderValues()}
                    </div>
                    {this.renderPopover()}
                </div>
                <a className="text-grey-2 no-decoration px1 flex align-center" href="#" onClick={this.removeFilter}>
                    <Icon name='close' width="14px" height="14px" />
                </a>
            </div>
        );
    }
}

FilterWidget.propTypes = {
    filter: PropTypes.array.isRequired,
    tableMetadata: PropTypes.object.isRequired,
    index: PropTypes.number.isRequired,
    updateFilter: PropTypes.func.isRequired,
    removeFilter: PropTypes.func.isRequired
};
