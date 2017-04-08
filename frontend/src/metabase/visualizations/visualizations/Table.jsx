/* @flow */

import React, { Component } from "react";

import TableInteractive from "../components/TableInteractive.jsx";
import TableSimple from "../components/TableSimple.jsx";

import * as DataGrid from "metabase/lib/data_grid";

import Query from "metabase/lib/query";
import { isMetric, isDimension } from "metabase/lib/schema_metadata";
import { columnsAreValid } from "metabase/visualizations/lib/settings";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields.jsx";

import _ from "underscore";
import { getIn } from "icepick";

import type { DatasetData } from "metabase/meta/types/Dataset";
import type { Card, VisualizationSettings } from "metabase/meta/types/Card";

type Props = {
    card: Card,
    data: DatasetData,
    settings: VisualizationSettings,
    isDashboard: boolean,
}
type State = {
    data: ?DatasetData
}

export default class Table extends Component<*, Props, State> {
    state: State;

    static uiName = "Table";
    static identifier = "table";
    static iconName = "table";

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable([{ data: { cols, rows} }]) {
        // scalar can always be rendered, nothing needed here
    }

    static settings = {
        "table.pivot": {
            title: "Pivot the table",
            widget: "toggle",
            getHidden: ([{ card, data }]) => (
                data && data.cols.length !== 3
            ),
            getDefault: ([{ card, data }]) => (
                (data && data.cols.length === 3) &&
                Query.isStructured(card.dataset_query) &&
                data.cols.filter(isMetric).length === 1 &&
                data.cols.filter(isDimension).length === 2
            )
        },
        "table.columns": {
            title: "Fields to include",
            widget: ChartSettingOrderedFields,
            getHidden: (series, vizSettings) => vizSettings["table.pivot"],
            isValid: ([{ card, data }]) =>
                card.visualization_settings["table.columns"] &&
                columnsAreValid(card.visualization_settings["table.columns"].map(x => x.name), data),
            getDefault: ([{ data: { cols }}]) => cols.map(col => ({
                name: col.name,
                enabled: col.visibility_type !== "details-only"
            })),
            getProps: ([{ data: { cols }}]) => ({
                columnNames: cols.reduce((o, col) => ({ ...o, [col.name]: getFriendlyName(col)}), {})
            })
        },
        "table.column_widths": {
        },
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            data: null
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
                }
            });
        }
    }

    render() {
        const { card, isDashboard, settings } = this.props;
        const { data } = this.state;
        const sort = getIn(card, ["dataset_query", "query", "order_by"]) || null;
        const isPivoted = settings["table.pivot"];
        const TableComponent = isDashboard ? TableSimple : TableInteractive;
        return (
            <TableComponent
                {...this.props}
                data={data}
                isPivoted={isPivoted}
                sort={sort}
            />
        );
    }
}
