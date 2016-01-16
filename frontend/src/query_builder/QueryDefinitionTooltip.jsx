import React, { Component, PropTypes } from "react";

import FilterList from "./filters/FilterList.jsx";
import AggregationWidget from "./AggregationWidget.jsx";
import FieldSet from "../admin/datamodel/components/FieldSet.jsx";

import Query from "metabase/lib/query";

export default class QueryDefinitionTooltip extends Component {
    static propTypes = {
        object: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    render() {
        const { object, tableMetadata } = this.props;
        return (
            <div className="p2" style={{width: 250}}>
                <div className="mb2">
                    {object.description}
                </div>
                <FieldSet legend="Definition" border="border-light">
                    <div className="TooltipFilterList">
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
                </FieldSet>
            </div>
        );
    }
}
