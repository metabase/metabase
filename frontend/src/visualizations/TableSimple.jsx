import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Table.css";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import { formatValue } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import cx from "classnames";
import _ from "underscore";

@ExplicitSize
export default class TableSimple extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            page: 0,
            sortColumn: null,
            sortDescending: false
        }
    }

    static propTypes = {
        data: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    setSort(colIndex) {
        if (this.state.sortColumn === colIndex) {
            this.setState({ sortDescending: !this.state.sortDescending });
        } else {
            this.setState({ sortColumn: colIndex });
        }
    }

    componentDidUpdate() {
        let headerHeight = ReactDOM.findDOMNode(this.refs.header).getBoundingClientRect().height;
        let rowHeight = ReactDOM.findDOMNode(this.refs.firstRow).getBoundingClientRect().height + 1;
        let pageSize = Math.floor((this.props.height - headerHeight) / rowHeight);
        if (this.state.pageSize !== pageSize) {
            this.setState({ pageSize });
        }
    }

    render() {
        const { series } = this.props;
        const { page, sortColumn, sortDescending } = this.state;

        let pageSize = this.state.pageSize || 1;
        let start = pageSize * page;
        let end = pageSize * (page + 1) - 1;

        let { rows, cols } = series[0].data;
        if (sortColumn != null) {
            rows = _.sortBy(rows, (row) => row[sortColumn]);
            if (sortDescending) {
                rows.reverse();
            }
        }

        return (
            <div className={cx(this.props.className, "relative flex flex-column")}>
                <div className="flex-full relative border-bottom">
                    <div className="absolute top bottom left right scroll-x scroll-show scroll-show--horizontal" style={{ overflowY: "hidden" }}>
                        <table className={cx(styles.Table, styles.TableSimple)}>
                            <thead ref="header">
                                <tr>
                                    {cols.map((col, colIndex) =>
                                        <th key={colIndex} className={cx("px1 pb1 border-bottom text-brand-hover", { "text-brand": sortColumn === colIndex })} onClick={() => this.setSort(colIndex)}>
                                            <div className="relative">
                                                { sortColumn === colIndex &&
                                                    <span style={{ position: "absolute", right: "100%", marginRight: 3 }}>{sortDescending ? "▾" : "▴"}</span>
                                                }
                                                <Ellipsified>{getFriendlyName(col)}</Ellipsified>
                                            </div>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                            {rows.slice(start, end + 1).map((row, rowIndex) =>
                                <tr key={rowIndex} ref={rowIndex === 0 ? "firstRow" : null}>
                                    {row.map((cell, colIndex) =>
                                        <td key={colIndex} style={{ whiteSpace: "nowrap" }} className="px1 border-bottom">
                                            { cell == null ? "-" : formatValue(cell, cols[colIndex], { jsx: true }) }
                                        </td>
                                    )}
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
                { pageSize < rows.length ?
                    <div className="p1 flex flex-no-shrink flex-align-right">
                        <span className="text-bold">Rows {start + 1}-{end + 1} of {rows.length}</span>
                        <span className={cx("text-brand-hover px1", { disabled: page === 0 })} onClick={() => this.setState({ page: page - 1 })}>◀</span>
                        <span className={cx("text-brand-hover pr1", { disabled: page >= rows.length / pageSize })} onClick={() => this.setState({ page: page + 1 })}>▶</span>
                    </div>
                : null }
            </div>
        );
    }
}
