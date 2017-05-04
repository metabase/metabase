/* @flow weak */

import React, { Component } from "react";

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
    parseFieldTargetId,
    generateTimeFilterValuesDescriptions
} from "metabase/lib/query_time";

import cx from "classnames";
import _ from "underscore";

import type {
    Card as CardObject,
    DatasetQuery
} from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { FieldFilter } from "metabase/meta/types/Query";

type Props = {
    className: string,
    card: CardObject,
    tableMetadata: TableMetadata,
    setDatasetQuery: (
        datasetQuery: DatasetQuery,
        options: { run: boolean }
    ) => void
};

type State = {
    filterIndex: number,
    filter: FieldFilter,
    currentFilter: any
};

export default class TimeseriesFilterWidget extends Component<*, Props, State> {
    state = {
        filter: null,
        filterIndex: -1,
        currentFilter: null
    };

    _popover: ?any;

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(nextProps: Props) {
        const query = Card.getQuery(nextProps.card);
        if (query) {
            const breakouts = Query.getBreakouts(query);
            const filters = Query.getFilters(query);

            const timeFieldId = parseFieldTargetId(breakouts[0]);
            const timeField = parseFieldTarget(breakouts[0]);

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
                filter = ["time-interval", timeField, -30, "day"];
            }

            // $FlowFixMe
            this.setState({ filter, filterIndex, currentFilter });
        }
    }

    render() {
        const {
            className,
            card,
            tableMetadata,
            setDatasetQuery
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
                sizeToFit
            >
                <DatePicker
                    filter={this.state.filter}
                    onFilterChange={newFilter => {
                        this.setState({ filter: newFilter });
                    }}
                    tableMetadata={tableMetadata}
                    includeAllTime
                />
                <div className="p1">
                    <Button
                        purple
                        className="full"
                        onClick={() => {
                            let query = Card.getQuery(card);
                            if (query) {
                                if (filterIndex >= 0) {
                                    query = Query.updateFilter(
                                        query,
                                        filterIndex,
                                        filter
                                    );
                                } else {
                                    query = Query.addFilter(query, filter);
                                }
                                // $FlowFixMe
                                const datasetQuery: DatasetQuery = {
                                    ...card.dataset_query,
                                    query
                                };
                                setDatasetQuery(datasetQuery, { run: true });
                            }
                            if (this._popover) {
                                this._popover.close();
                            }
                        }}
                    >
                        Apply
                    </Button>
                </div>
            </PopoverWithTrigger>
        );
    }
}
