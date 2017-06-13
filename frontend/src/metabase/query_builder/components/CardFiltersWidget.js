import React, { Component } from "react";

import FilterList from './filters/FilterList.jsx';

import Query from "metabase/lib/query";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { Filter } from "metabase/meta/types/Query";

export default class CardFiltersWidget extends Component {
    props: {
        datasetQuery: DatasetQuery,
        tableMetadata: TableMetadata,
        removeQueryFilter: (index: number) => void,
        updateQueryFilter: (index: number, filter: Filter) => void,
        addQueryFilter: () => void
    };

    render() {
        if (this.props.tableMetadata) {
            let filters = Query.getFilters(this.props.datasetQuery.query);
            if (filters && filters.length > 0) {
                return (
                    <FilterList
                        filters={filters}
                        tableMetadata={this.props.tableMetadata}
                        updateFilter={this.props.updateQueryFilter}
                    />
                );
            }
        }

        return null;
    }
}
