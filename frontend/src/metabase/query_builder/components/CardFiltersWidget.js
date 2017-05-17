import React, { Component } from "react";
import cx from "classnames";

import FilterList from './filters/FilterList.jsx';
import FilterPopover from './filters/FilterPopover.jsx';
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

import Query from "metabase/lib/query";

import type {DatasetQuery} from "metabase/meta/types/Card";
import type {TableMetadata} from "metabase/meta/types/Metadata";
import type {Filter} from "metabase/meta/types/Query";

export default class CardFiltersWidget extends Component {
    props: {
        datasetQuery: DatasetQuery,
        tableMetadata: TableMetadata,
        removeQueryFilter: (index: number) => void,
        updateQueryFilter: (index: number, filter: Filter) => void,
        addQueryFilter: () => void
    };

    render() {
        let enabled;
        let filterList;

        if (this.props.tableMetadata) {
            enabled = true;

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
        } else {
            return;
        }

    }
}
