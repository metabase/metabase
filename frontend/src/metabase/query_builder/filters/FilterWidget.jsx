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

    removeFilter() {
        this.props.removeFilter(this.props.index);
    }

    open() {
        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    renderOperatorFilter() {
        const { filter, tableMetadata, maxDisplayValues } = this.props;
        let [operator, field, ...values] = filter;

        let target = Query.getFieldTarget(field, tableMetadata);
        let fieldDef = target && target.field;
        let operatorDef = fieldDef && fieldDef.operators_lookup[operator];

        if (operatorDef && operatorDef.multi && values.length > maxDisplayValues) {
            values = [values.length + " selections"];
        }

        if (isDate(fieldDef)) {
            values = generateTimeFilterValuesDescriptions(this.props.filter);
        }

        return (
            <div onClick={this.open}>
                <div className="flex align-center" style={{padding: "0.5em", paddingTop: "0.3em", paddingBottom: "0.3em", paddingLeft: 0}}>
                    <FieldName
                        className="Filter-section Filter-section-field"
                        tableMetadata={this.props.tableMetadata}
                        field={field}
                        fieldOptions={Query.getFieldOptions(this.props.tableMetadata.fields, true)}
                    />
                    <div className="Filter-section Filter-section-operator">
                        &nbsp;
                        <a className="QueryOption flex align-center">{operatorDef && operatorDef.moreVerboseName}</a>
                    </div>
                </div>
                <div className="flex align-center flex-wrap">
                    {values.map((value, valueIndex) => {
                        var valueString = value != null ? value.toString() : null;
                        return value != undefined && (
                            <div key={valueIndex} className="Filter-section Filter-section-value">
                                <span className="QueryOption">{valueString}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        )
    }

    renderSegmentFilter() {
        const { filter, tableMetadata } = this.props;
        const segment = _.find(tableMetadata.segments, (s) => s.id === filter[1]);
        return (
            <div onClick={this.open}>
                <div className="flex align-center" style={{padding: "0.5em", paddingTop: "0.3em", paddingBottom: "0.3em", paddingLeft: 0}}>
                    <div className="Filter-section Filter-section-field">
                        <span className="QueryOption">Matches</span>
                    </div>
                </div>
                <div className="flex align-center flex-wrap">
                    <div className="Filter-section Filter-section-value">
                        <span className="QueryOption">{segment && segment.name}</span>
                    </div>
                </div>
            </div>
        )
    }

    renderPopover() {
        if (this.state.isOpen) {
            return (
                <Popover
                    id="FilterPopover"
                    ref="filterPopover"
                    className="FilterPopover"
                    isInitiallyOpen={this.props.filter[1] === null}
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
        const { filter } = this.props;
        return (
            <div className={cx("Query-filter p1 pl2", { "selected": this.state.isOpen })}>
                <div>
                    {filter[0] === "SEGMENT" ?
                        this.renderSegmentFilter()
                    :
                        this.renderOperatorFilter()
                    }
                    {this.renderPopover()}
                </div>
                { this.props.removeFilter &&
                    <a className="text-grey-2 no-decoration px1 flex align-center" onClick={this.removeFilter}>
                        <Icon name='close' size={14} />
                    </a>
                }
            </div>
        );
    }
}
