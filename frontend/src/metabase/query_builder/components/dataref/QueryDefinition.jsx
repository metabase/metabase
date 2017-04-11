import React from "react";

import FilterList from "../filters/FilterList.jsx";
import AggregationWidget from "../AggregationWidget.jsx";

import Query from "metabase/lib/query";

const QueryDefinition = ({ className, object, tableMetadata }) => {
    const filters = Query.getFilters(object.definition);
    return (
        <div className={className} style={{ pointerEvents: "none" }}>
            { object.definition.aggregation &&
                <AggregationWidget
                    aggregation={object.definition.aggregation}
                    tableMetadata={tableMetadata}
                />
            }
            { filters.length > 0 &&
                <FilterList
                    filters={filters}
                    tableMetadata={tableMetadata}
                    maxDisplayValues={Infinity}
                />
            }
        </div>
    );
}

export default QueryDefinition;
