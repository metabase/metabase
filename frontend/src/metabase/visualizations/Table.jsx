/* @flow */

import React, { Component, PropTypes } from "react";

import TableInteractive from "./TableInteractive.jsx";
import TableSimple from "./TableSimple.jsx";

import * as DataGrid from "metabase/lib/data_grid";
import _ from "underscore";

import type { DatasetData } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

type Props = {
    card: Card,
    data: DatasetData,
    settings: VisualizationSettings,
    isDashboard: boolean,
    cellClickedFn: (number, number) => void,
    cellIsClickableFn: (number, number) => boolean,
    setSortFn: (/* TODO */) => void,
}
type State = {
    data: ?DatasetData,
    columnIndexes: number[]
}

export default class Bar extends Component<*, Props, State> {
    state: State;

    static uiName = "Table";
    static identifier = "table";
    static iconName = "table";

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            data: null,
            columnIndexes: []
        };
    }

    componentWillMount() {
        this._updateData(this.props);
    }

    componentWillReceiveProps(newProps: Props) {
        // TODO: remove use of deprecated "card" and "data" props
        if (newProps.data !== this.props.data || !_.isEqual(newProps.settings, this.props.settings)) {
            this._updateData(newProps);
        }
    }

    cellClicked = (rowIndex: number, columnIndex: number, ...args: any[]) => {
        this.props.cellClickedFn(rowIndex, this.state.columnIndexes[columnIndex], ...args);
    }

    cellIsClickable = (rowIndex: number, columnIndex: number, ...args: any[]) => {
        return this.props.cellIsClickableFn(rowIndex, this.state.columnIndexes[columnIndex], ...args);
    }

    _updateData({ data, settings }: { data: DatasetData, settings: VisualizationSettings }) {
        if (settings["table.pivot"]) {
            this.setState({
                data: DataGrid.pivot(data)
            });
        } else {
            const { cols, rows, columns } = data;
            const columnIndexes = settings["table.columns"]
                .filter(f => f.enabled)
                .map(f => _.findIndex(cols, (c) => c.name === f.name))
                .filter(i => i >= 0 && i < cols.length);

            this.setState({
                data: {
                    cols: columnIndexes.map(i => cols[i]),
                    columns: columnIndexes.map(i => columns[i]),
                    rows: rows.map(row => columnIndexes.map(i => row[i]))
                },
                columnIndexes
            });
        }
    }

    render() {
        const { card, cellClickedFn, cellIsClickableFn, setSortFn, isDashboard, settings } = this.props;
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
                cellClickedFn={(!cellClickedFn || isPivoted) ? undefined : this.cellClicked}
                cellIsClickableFn={(!cellIsClickableFn || isPivoted) ? undefined : this.cellIsClickable}
            />
        );
    }
}
