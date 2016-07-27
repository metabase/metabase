import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Table.css";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Icon from "metabase/components/Icon.jsx";

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
            pageSize: 1,
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
        let footerHeight = this.refs.footer ? ReactDOM.findDOMNode(this.refs.footer).getBoundingClientRect().height : 0;
        let rowHeight = ReactDOM.findDOMNode(this.refs.firstRow).getBoundingClientRect().height + 1;
        let pageSize = Math.max(1, Math.floor((this.props.height - headerHeight - footerHeight) / rowHeight));
        if (this.state.pageSize !== pageSize) {
            this.setState({ pageSize });
        }
    }

    render() {
        const { data } = this.props;
        const { page, pageSize, sortColumn, sortDescending } = this.state;

        let { rows, cols } = data;

        let start = pageSize * page;
        let end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

        if (sortColumn != null) {
            rows = _.sortBy(rows, (row) => row[sortColumn]);
            if (sortDescending) {
                rows.reverse();
            }
        }

        return (
            <div className={cx(this.props.className, "relative flex flex-column")}>
                <div className="flex-full relative border-bottom">
                    <div className="absolute top bottom left right scroll-x scroll-show scroll-show--horizontal scroll-show--hover" style={{ overflowY: "hidden" }}>
                        <table className={cx(styles.Table, styles.TableSimple, 'fullscreen-normal-text', 'fullscreen-night-text')}>
                            <thead ref="header">
                                <tr>
                                    {cols.map((col, colIndex) =>
                                        <th key={colIndex} className={cx("MB-DataTable-header cellData text-brand-hover", { "MB-DataTable-header--sorted": sortColumn === colIndex })} onClick={() => this.setSort(colIndex)}>
                                            <div className="relative">
                                                <Icon
                                                    name={sortDescending ? "chevrondown" : "chevronup"}
                                                    width={8} height={8}
                                                    style={{ position: "absolute", right: "100%", marginRight: 3 }}
                                                />
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
                                            { cell == null ? "-" : formatValue(cell, { column: cols[colIndex], jsx: true }) }
                                        </td>
                                    )}
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
                { pageSize < rows.length ?
                    <div ref="footer" className="p1 flex flex-no-shrink flex-align-right fullscreen-normal-text fullscreen-night-text">
                        <span className="text-bold">Rows {start + 1}-{end + 1} of {rows.length}</span>
                        <span className={cx("text-brand-hover px1 cursor-pointer", { disabled: start === 0 })} onClick={() => this.setState({ page: page - 1 })}>
                            <Icon name="left" size={10} />
                        </span>
                        <span className={cx("text-brand-hover pr1 cursor-pointer", { disabled: end + 1 >= rows.length })} onClick={() => this.setState({ page: page + 1 })}>
                            <Icon name="right" size={10} />
                        </span>
                    </div>
                : null }
            </div>
        );
    }
}
