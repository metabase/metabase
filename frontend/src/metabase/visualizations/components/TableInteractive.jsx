/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import "./TableInteractive.css";

import Icon from "metabase/components/Icon.jsx";

import Value from "metabase/components/Value.jsx";

import { capitalize } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { getTableCellClickedObject } from "metabase/visualizations/lib/table";

import _ from "underscore";
import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import { Grid, ScrollSync } from "react-virtualized";
import Draggable from "react-draggable";

const HEADER_HEIGHT = 50;
const ROW_HEIGHT = 35;
const MIN_COLUMN_WIDTH = ROW_HEIGHT;
const RESIZE_HANDLE_WIDTH = 5;

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type Props = VisualizationProps & {
    width: number,
    height: number,
    sort: any,
    isPivoted: boolean,
}
type State = {
    columnWidths: number[],
    contentWidths: ?number[]
}

type CellRendererProps = {
    key: string,
    style: { [key:string]: any },
    columnIndex: number,
    rowIndex: number
}

type GridComponent = Component<void, void, void> & { recomputeGridSize: () => void }

@ExplicitSize
export default class TableInteractive extends Component<*, Props, State> {
    state: State;
    props: Props;

    columnHasResized: { [key:number]: boolean };
    columnNeedsResize: { [key:number]: boolean };
    _div: HTMLElement;

    header: GridComponent;
    grid: GridComponent;

    constructor(props: Props) {
        super(props);

        this.state = {
            columnWidths: [],
            contentWidths: null
        };
        this.columnHasResized = {};
    }

    static propTypes = {
        data: PropTypes.object.isRequired,
        isPivoted: PropTypes.bool.isRequired,
        sort: PropTypes.array
    };

    static defaultProps = {
        isPivoted: false,
    };

    componentWillMount() {
        // for measuring cells:
        this._div = document.createElement("div");
        this._div.className = "TableInteractive";
        this._div.style.display = "inline-block"
        this._div.style.position = "absolute"
        this._div.style.visibility = "hidden"
        this._div.style.zIndex = "-1"
        document.body.appendChild(this._div);

        this._measure();
    }

    componentWillUnmount() {
        if (this._div && this._div.parentNode) {
            this._div.parentNode.removeChild(this._div);
        }
    }

    componentWillReceiveProps(newProps: Props) {
        if (JSON.stringify(this.props.data && this.props.data.cols) !== JSON.stringify(newProps.data && newProps.data.cols)) {
            this.resetColumnWidths();
        }
    }

    shouldComponentUpdate(nextProps: Props, nextState: State) {
        const PROP_KEYS: string[] = ["width", "height", "settings", "data"];
        // compare specific props and state to determine if we should re-render
        return (
            !_.isEqual(_.pick(this.props, ...PROP_KEYS), _.pick(nextProps, ...PROP_KEYS)) ||
            !_.isEqual(this.state, nextState)
        );
    }

    componentDidUpdate() {
        if (!this.state.contentWidths) {
            this._measure();
        }
    }

    resetColumnWidths() {
        this.setState({
            columnWidths: [],
            contentWidths: null
        });
        this.columnHasResized = {};
        this.props.onUpdateVisualizationSettings({ "table.column_widths": undefined });
    }

    _measure() {
        const { data: { cols } } = this.props;

        let contentWidths = cols.map((col, index) =>
            this._measureColumn(index)
        );

        let columnWidths: number[] = cols.map((col, index) => {
            if (this.columnNeedsResize) {
                if (this.columnNeedsResize[index] && !this.columnHasResized[index]) {
                    this.columnHasResized[index] = true;
                    return contentWidths[index] + 1; // + 1 to make sure it doen't wrap?
                } else if (this.state.columnWidths[index]) {
                    return this.state.columnWidths[index];
                } else {
                    return 0;
                }
            } else {
                return contentWidths[index] + 1;
            }
        });

        delete this.columnNeedsResize;

        this.setState({ contentWidths, columnWidths }, this.recomputeGridSize);
    }

    _measureColumn(columnIndex: number) {
        const { data: { rows } } = this.props;
        let width = MIN_COLUMN_WIDTH;

        // measure column header
        width = Math.max(width, this._measureCell(this.tableHeaderRenderer({ columnIndex, rowIndex: 0, key: "", style: {} })));

        // measure up to 10 non-nil cells
        let remaining = 10;
        for (let rowIndex = 0; rowIndex < rows.length && remaining > 0; rowIndex++) {
            if (rows[rowIndex][columnIndex] != null) {
                const cellWidth = this._measureCell(this.cellRenderer({ rowIndex, columnIndex, key: "", style: {} }));
                width = Math.max(width, cellWidth);
                remaining--;
            }
        }

        return width;
    }

    _measureCell(cell: React.Element<any>) {
        ReactDOM.unstable_renderSubtreeIntoContainer(this, cell, this._div);

        // 2px for border?
        const width = this._div.clientWidth + 2;

        ReactDOM.unmountComponentAtNode(this._div);

        return width;
    }

    recomputeGridSize = () => {
        if (this.header && this.grid) {
            this.header.recomputeGridSize();
            this.grid.recomputeGridSize();
        }
    }

    recomputeColumnSizes = _.debounce(() => {
        this.setState({ contentWidths: null })
    }, 100)

    onCellResize(columnIndex: number) {
        this.columnNeedsResize = this.columnNeedsResize || {}
        this.columnNeedsResize[columnIndex] = true;
        this.recomputeColumnSizes();
    }

    onColumnResize(columnIndex: number, width: number) {
        const { settings } = this.props;
        let columnWidthsSetting = settings["table.column_widths"] ? settings["table.column_widths"].slice() : [];
        columnWidthsSetting[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);
        this.props.onUpdateVisualizationSettings({ "table.column_widths": columnWidthsSetting });
        setTimeout(() => this.recomputeGridSize(), 1);
    }

    cellRenderer = ({ key, style, rowIndex, columnIndex }: CellRendererProps) => {
        const { data, isPivoted, onVisualizationClick, visualizationIsClickable } = this.props;
        const { rows, cols } = data;

        const column = cols[columnIndex];
        const row = rows[rowIndex];
        const value = row[columnIndex];

        const clicked = getTableCellClickedObject(data, rowIndex, columnIndex, isPivoted);
        const isClickable = onVisualizationClick && visualizationIsClickable(clicked);

        return (
            <div
                key={key} style={style}
                className={cx("TableInteractive-cellWrapper cellData", {
                    "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
                    "cursor-pointer": isClickable
                })}
                onClick={isClickable && ((e) => {
                    onVisualizationClick({ ...clicked, element: e.currentTarget });
                })}
            >
                <Value
                    className="link"
                    type="cell"
                    value={value}
                    column={column}
                    onResize={this.onCellResize.bind(this, columnIndex)}
                />
            </div>
        );
    }

    tableHeaderRenderer = ({ key, style, columnIndex }: CellRendererProps) => {
        const { sort, isPivoted, onVisualizationClick, visualizationIsClickable } = this.props;
        // $FlowFixMe: not sure why flow has a problem with this
        const { cols } = this.props.data;
        const column = cols[columnIndex];

        let columnTitle = getFriendlyName(column);
        if (column.unit && column.unit !== "default") {
            columnTitle += ": " + capitalize(column.unit.replace(/-/g, " "))
        }
        if (!columnTitle && this.props.isPivoted && columnIndex !== 0) {
            columnTitle = "Unset";
        }

        let clicked;
        if (isPivoted) {
            // if it's a pivot table, the first column is
            if (columnIndex >= 0) {
                clicked = column._dimension;
            }
        } else {
            clicked = { column };
        }

        const isClickable = onVisualizationClick && visualizationIsClickable(clicked);
        const isSortable = isClickable && column.source;

        return (
            <div
                key={key}
                style={{ ...style, overflow: "visible" /* ensure resize handle is visible */ }}
                className={cx("TableInteractive-cellWrapper TableInteractive-headerCellData", {
                    "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
                    "TableInteractive-headerCellData--sorted": (sort && sort[0] && sort[0][0] === column.id),
                })}
            >
                <div
                    className={cx("cellData", { "cursor-pointer": isClickable })}
                    onClick={isClickable && ((e) => {
                        onVisualizationClick({ ...clicked, element: e.currentTarget });
                    })}
                >
                    {columnTitle}
                    {isSortable &&
                        <Icon
                            className="Icon ml1"
                            name={sort && sort[0] && sort[0][1] === "ascending" ? "chevronup" : "chevrondown"}
                            size={8}
                        />
                    }
                </div>
                <Draggable
                    axis="x"
                    bounds={{ left: RESIZE_HANDLE_WIDTH }}
                    position={{ x: this.getColumnWidth({ index: columnIndex }), y: 0 }}
                    onStop={(e, { x }) => {
                        this.onColumnResize(columnIndex, x)}
                    }
                >
                    <div
                        className="bg-brand-hover bg-brand-active"
                        style={{ zIndex: 99, position: "absolute", width: RESIZE_HANDLE_WIDTH, top: 0, bottom: 0, left: -RESIZE_HANDLE_WIDTH - 1, cursor: "ew-resize" }}
                    />
                </Draggable>
            </div>
        )
    }

    getColumnWidth = ({ index }: { index: number }) => {
        const { settings } = this.props;
        const { columnWidths } = this.state;
        const columnWidthsSetting = settings["table.column_widths"] || [];
        return columnWidthsSetting[index] || columnWidths[index] || MIN_COLUMN_WIDTH;
    }

    render() {
        const { width, height, data: { cols, rows }, className } = this.props;

        if (!width || !height) {
            return <div className={className} />;
        }

        return (
            <ScrollSync>
            {({ clientHeight, clientWidth, onScroll, scrollHeight, scrollLeft, scrollTop, scrollWidth }) =>
                <div className={cx(className, 'TableInteractive relative', { 'TableInteractive--pivot': this.props.isPivoted, 'TableInteractive--ready': this.state.contentWidths })}>
                    <canvas className="spread" style={{ pointerEvents: "none", zIndex: 999 }} width={width} height={height} />
                    <Grid
                        ref={(ref) => this.header = ref}
                        style={{ top: 0, left: 0, right: 0, height: HEADER_HEIGHT, position: "absolute", overflow: "hidden" }}
                        className="TableInteractive-header scroll-hide-all"
                        width={width || 0}
                        height={HEADER_HEIGHT}
                        rowCount={1}
                        rowHeight={HEADER_HEIGHT}
                        // HACK: there might be a better way to do this, but add a phantom padding cell at the end to ensure scroll stays synced if main content scrollbars are visible
                        columnCount={cols.length + 1}
                        columnWidth={(props) => props.index < cols.length ? this.getColumnWidth(props) : 50}
                        cellRenderer={(props) => props.columnIndex < cols.length ? this.tableHeaderRenderer(props) : null}
                        onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                        scrollLeft={scrollLeft}
                        tabIndex={null}
                    />
                    <Grid
                        ref={(ref) => this.grid = ref}
                        style={{ top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0, position: "absolute" }}
                        className=""
                        width={width}
                        height={height - HEADER_HEIGHT}
                        columnCount={cols.length}
                        columnWidth={this.getColumnWidth}
                        rowCount={rows.length}
                        rowHeight={ROW_HEIGHT}
                        cellRenderer={this.cellRenderer}
                        onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                        scrollLeft={scrollLeft}
                        tabIndex={null}
                        overscanRowCount={20}
                    />
                </div>
            }
            </ScrollSync>
        );
    }
}
