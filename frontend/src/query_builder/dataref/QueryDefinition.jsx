import React, { Component, PropTypes } from "react";

import FilterList from "../filters/FilterList.jsx";
import AggregationWidget from "../AggregationWidget.jsx";

import Query from "metabase/lib/query";

const QueryDefinition = ({ objectType, object, tableMetadata }) =>
    <div style={{ pointerEvents: "none" }}>
        <p className="text-bold">{objectType} Definition</p>
        { object.definition.aggregation &&
            <AggregationWidget
                aggregation={object.definition.aggregation}
                tableMetadata={tableMetadata}
            />
        }
        <FilterList
            filters={Query.getFilters(object.definition)}
            tableMetadata={tableMetadata}
            maxDisplayValues={Infinity}
        />
    </div>

export default QueryDefinition;
