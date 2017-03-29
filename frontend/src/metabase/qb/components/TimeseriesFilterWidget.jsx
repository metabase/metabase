/* @flow weak */

import React, { Component, PropTypes } from "react";

import DatePicker
    from "metabase/query_builder/components/filters/pickers/DatePicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { SelectButton } from "metabase/components/Select";
import Button from "metabase/components/Button";

import * as Query from "metabase/lib/query/query";
import * as Filter from "metabase/lib/query/filter";
import * as Field from "metabase/lib/query/field";
import * as Card from "metabase/meta/Card";

import {
    parseFieldTarget,
    generateTimeFilterValuesDescriptions
} from "metabase/lib/query_time";

import cx from "classnames";
import _ from "underscore";

export default class TimeseriesFilterWidget extends Component {
    state = {
        filter: null,
        filterIndex: -1
    };

    componentWillReceiveProps(nextProps) {
        const query = Card.getQuery(nextProps.card);
        const breakouts = Query.getBreakouts(query);
        const filters = Query.getFilters(query);
        const timeFieldId = parseFieldTarget(breakouts[0]);
        const filterIndex = _.findIndex(
            filters,
            filter =>
                Filter.isFieldFilter(filter) &&
                Field.getFieldTargetId(filter[1]) === timeFieldId
        );

        let filter, currentFilter;
        if (filterIndex >= 0) {
            filter = (currentFilter = filters[filterIndex]);
        } else {
            filter = ["BETWEEN", timeFieldId];
        }
        this.setState({ filter, filterIndex, currentFilter });
    }

    render() {
        const {
            className,
            card,
            tableMetadata,
            setDatasetQuery,
            runQueryFn
        } = this.props;
        const { filter, filterIndex, currentFilter } = this.state;
        let currentDescription;
        if (currentFilter) {
            currentDescription = generateTimeFilterValuesDescriptions(
                currentFilter
            ).join(" - ");
            if (currentFilter[0] === ">") {
                currentDescription = "After " + currentDescription;
            } else if (currentFilter[0] === "<") {
                currentDescription = "Before " + currentDescription;
            }
        } else {
            currentDescription = "All Time";
        }
        return (
            <PopoverWithTrigger
                triggerElement={
                    <SelectButton hasValue>
                        {currentDescription}
                    </SelectButton>
                }
                triggerClasses={cx(className, "my2")}
                ref={ref => this._popover = ref}
            >
                <DatePicker
                    className="mt2"
                    filter={this.state.filter}
                    onFilterChange={newFilter => {
                        this.setState({ filter: newFilter });
                    }}
                    tableMetadata={tableMetadata}
                />
                <div className="p1">
                    <Button
                        purple
                        className="full"
                        onClick={() => {
                            let query = Card.getQuery(card);
                            if (filterIndex >= 0) {
                                query = Query.updateFilter(
                                    query,
                                    filterIndex,
                                    filter
                                );
                            } else {
                                query = Query.addFilter(query, filter);
                            }
                            setDatasetQuery({ ...card.dataset_query, query });
                            runQueryFn();
                            this._popover.close();
                        }}
                    >Apply</Button>
                </div>
            </PopoverWithTrigger>
        );
    }
}
