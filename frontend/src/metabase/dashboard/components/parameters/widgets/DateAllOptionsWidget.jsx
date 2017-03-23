import React, {Component, PropTypes} from "react";

import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import {generateTimeFilterValuesDescriptions} from "metabase/lib/query_time";

import type {FieldFilter} from "metabase/meta/types/Query";

export default class DateAllOptionsWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            filter: props.value != null ? this.convertWidgetValueToFilter(props.value) : []
        }
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (filterValue) => {
        return filterValue ? generateTimeFilterValuesDescriptions(filterValue).join(" - ") : null;
    };

    componentWillUnmount() {
        this.props.setValue(this.state.filter);
    }

    setFilter = (filter: FieldFilter) => {
        this.setState(this.convertFilterToWidgetValue({filter}));
    };

    convertWidgetValueToFilter = (value) => {
        // TODO: Implement url-friendly value deserialization
        return value;
    };

    convertFilterToWidgetValue = (filter) => {
        // TODO: Implement url-friendly value serialization
        return filter;
    };

    render() {
        const {onClose} = this.props;

        return (<div>
            <DatePicker
                filter={this.state.filter}
                onFilterChange={this.setFilter}
            />
            <div className="FilterPopover-footer p1">
                <button
                    className="Button Button--purple full"
                    onClick={onClose}
                >
                    Update filter
                </button>
            </div>
        </div>)
    }
}
