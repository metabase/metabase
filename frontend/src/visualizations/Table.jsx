import React, { Component, PropTypes } from "react";

import TableInteractive from "./TableInteractive.jsx";
import TableSimple from "./TableSimple.jsx";

import Query from "metabase/lib/query";

export default class Bar extends Component {
    static displayName = "Table";
    static identifier = "table";
    static iconName = "table";

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    render() {
        let { card, data, cellClickedFn, setSortFn } = this.props;

        if (this.props.isDashboard) {
            return <TableSimple {...this.props} />;
        } else {
            let pivot = false;
            let sort = card.dataset_query.query && card.dataset_query.query.order_by || null;

            // check if the data is pivotable (2 groupings + 1 agg != 'rows')
            if (Query.isStructured(card.dataset_query) &&
                    !Query.isBareRowsAggregation(card.dataset_query.query) &&
                    data.cols.length === 3
            ) {
                pivot = true;
                setSortFn = null;
                cellClickedFn = () => false;
            }

            return (
                <TableInteractive
                    {...this.props}
                    pivot={pivot}
                    sort={sort}
                    setSortFn={setSortFn}
                    cellClickedFn={cellClickedFn}
                />
            );
        }
    }
}
