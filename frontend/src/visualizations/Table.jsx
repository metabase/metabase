import React, { Component, PropTypes } from "react";

import TableInteractive from "./TableInteractive.jsx";
import TableSimple from "./TableSimple.jsx";

import Query from "metabase/lib/query";
import DataGrid from "metabase/lib/data_grid";

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

    constructor(props, context) {
        super(props, context);

        this.state = {
            data: null,
            isPivoted: null
        };
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (newProps.data !== this.state.rawData && newProps.data) {
            // check if the data is pivotable (2 groupings + 1 agg != 'rows')
            const isPivoted = !!(
                Query.isStructured(newProps.card.dataset_query) &&
                !Query.isBareRowsAggregation(newProps.card.dataset_query.query) &&
                newProps.data.cols.length === 3
            );
            const data = isPivoted ? DataGrid.pivot(newProps.data) : newProps.data;
            this.setState({
                isPivoted: isPivoted,
                data: data,
                rawData: newProps.data
            });
        }
    }

    render() {
        let { card, cellClickedFn, setSortFn, isDashboard } = this.props;
        const { isPivoted, data } = this.state;
        const sort = card.dataset_query.query && card.dataset_query.query.order_by || null;
        const TableComponent = isDashboard ? TableSimple : TableInteractive;
        return (
            <TableComponent
                {...this.props}
                data={data}
                isPivoted={isPivoted}
                sort={sort}
                setSortFn={isPivoted ? undefined : setSortFn}
                cellClickedFn={isPivoted ? undefined : cellClickedFn}
            />
        );
    }
}
