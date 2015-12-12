import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import FieldName from '../FieldName.jsx';
import Popover from "metabase/components/Popover.jsx";
import FilterPopover from "./FilterPopover.jsx";

import Query from "metabase/lib/query";
import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { isDate } from "metabase/lib/schema_metadata";

import cx from "classnames";
import _ from "underscore";

export default class FilterWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: this.props.filter[0] == undefined
        };

        _.bindAll(this, "open", "close", "removeFilter");
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        index: PropTypes.number.isRequired,
        updateFilter: PropTypes.func,
        removeFilter: PropTypes.func
    };

    static defaultProps = {
        maxDisplayValues: 1
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { filter } = newProps;
        let [operator, field, ...values] = filter;

        let target = Query.getFieldTarget(field, newProps.tableMetadata);
        let fieldDef = target && target.field;
        let operatorDef = fieldDef && fieldDef.operators_lookup[operator];

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
                tableMetadata={this.props.tableMetadata}
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
        const { maxDisplayValues } = this.props;
        let { operatorDef, fieldDef, values } = this.state;

        if (operatorDef && operatorDef.multi && values.length > maxDisplayValues) {
            values = [values.length + " selections"];
        }

        if (isDate(fieldDef)) {
            values = generateTimeFilterValuesDescriptions(this.props.filter);
        }

        return values.map((value, valueIndex) => {
            var valueString = value != null ? value.toString() : null;
            return value != undefined && (
                <div key={valueIndex} className="Filter-section Filter-section-value" onClick={this.open}>
                    <span className="QueryOption">{valueString}</span>
                </div>
            );
        });
    }

    renderPopover() {
        if (this.state.isOpen) {
            return (
                <Popover
                    ref="filterPopover"
                    className="FilterPopover"
                    isInitiallyOpen={this.state.field === null}
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
            <div className={cx("Query-filter p1", { "selected": this.state.isOpen })}>
                <div className="ml1">
                    <div className="flex align-center" style={{"padding": "0.5em", "paddingTop": "0.3em", "paddingBottom": "0.3em"}}>
                        {this.renderField()}
                        {this.renderOperator()}
                    </div>
                    <div className="flex align-center flex-wrap">
                        {this.renderValues()}
                    </div>
                    {this.renderPopover()}
                </div>
                { this.props.removeFilter &&
                    <a className="text-grey-2 no-decoration px1 flex align-center" href="#" onClick={this.removeFilter}>
                        <Icon name='close' width="14px" height="14px" />
                    </a>
                }
            </div>
        );
    }
}
