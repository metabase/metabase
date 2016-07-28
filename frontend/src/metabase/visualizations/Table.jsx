import React, { Component, PropTypes } from "react";

import TableInteractive from "./TableInteractive.jsx";
import TableSimple from "./TableSimple.jsx";

import * as DataGrid from "metabase/lib/data_grid";
import _ from "underscore";

export default class Bar extends Component {
    static displayName = "Table";
    static identifier = "table";
    static iconName = "table";

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    constructor(props, context) {
        super(props, context);

        this.state = {
            data: null
        };
    }

    componentWillMount() {
        this._updateData(this.props);
    }

    componentWillReceiveProps(newProps) {
        // TODO: remove use of deprecated "card" and "data" props
        if (newProps.data !== this.props.data || !_.isEqual(newProps.settings, this.props.settings)) {
            this._updateData(newProps);
        }
    }

    _updateData({ data, settings }) {
        if (settings["table.pivot"]) {
            this.setState({
                data: DataGrid.pivot(data)
            });
        } else {
            const { cols, rows, columns } = data;
            const colIndexes = settings["table.columns"]
                .filter(f => f.enabled)
                .map(f => _.findIndex(cols, (c) => c.name === f.name))
                .filter(i => i >= 0 && i < cols.length);

            this.setState({
                data: {
                    cols: colIndexes.map(i => cols[i]),
                    columns: colIndexes.map(i => columns[i]),
                    rows: rows.map(row => colIndexes.map(i => row[i]))
                },
            });
        }
    }

    render() {
        const { card, cellClickedFn, setSortFn, isDashboard, settings } = this.props;
        const { data } = this.state;
        const sort = card.dataset_query.query && card.dataset_query.query.order_by || null;
        const isPivoted = settings["table.pivot"];
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
