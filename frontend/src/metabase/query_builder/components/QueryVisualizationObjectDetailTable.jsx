import React, { Component } from "react";
import PropTypes from "prop-types";

import ExpandableString from './ExpandableString.jsx';
import Icon from 'metabase/components/Icon.jsx';
import IconBorder from 'metabase/components/IconBorder.jsx';
import LoadingSpinner from 'metabase/components/LoadingSpinner.jsx';
import { foreignKeyCountsByOriginTable } from 'metabase/lib/schema_metadata';
import { TYPE, isa, isPK } from "metabase/lib/types";
import { singularize, inflect } from 'inflection';
import { formatValue } from "metabase/lib/formatting";
import { isQueryable } from "metabase/lib/table";

import cx from "classnames";

export default class QueryVisualizationObjectDetailTable extends Component {
    constructor(props, context) {
        super(props, context);
        this.cellClicked = this.cellClicked.bind(this);
        this.clickedForeignKey = this.clickedForeignKey.bind(this);
    }

    static propTypes = {
        data: PropTypes.object
    };

    componentDidMount() {
        // load up FK references
        this.props.loadObjectDetailFKReferences();
    }

    componentWillReceiveProps(nextProps) {
        // if the card has changed then reload fk references
        if (this.props.data != nextProps.data) {
            this.props.loadObjectDetailFKReferences();
        }
    }

    getIdValue() {
        if (!this.props.data) return null;

        for (var i=0; i < this.props.data.cols.length; i++) {
            var coldef = this.props.data.cols[i];
            if (isPK(coldef.special_type)) {
                return this.props.data.rows[0][i];
            }
        }
    }

    rowGetter(rowIndex) {
        // Remember that we are pivoting the data, so for row 5 we want to return an array with [coldef, value]
        return [this.props.data.cols[rowIndex], this.props.data.rows[0][rowIndex]];
    }

    cellClicked(rowIndex, columnIndex) {
        this.props.cellClickedFn(rowIndex, columnIndex);
    }

    cellRenderer(cellData, cellDataKey, rowData, rowIndex, columnData, width) {
        // TODO: should we be casting all values toString()?
        // Check out the expected format of each row above in the rowGetter() function
        var row = this.rowGetter(rowIndex),
            key = 'cl'+rowIndex+'_'+cellDataKey;

        if (cellDataKey === 'field') {
            var colValue = (row[0] !== null) ? (row[0].display_name.toString() || row[0].name.toString()) : null;
            return (<div key={key}>{colValue}</div>);
        } else {

            var cellValue;
            if (row[1] === null || row[1] === undefined || (typeof row[1] === "string" && row[1].length === 0)) {
                cellValue = (<span className="text-grey-2">Empty</span>);
            } else if (isa(row[0].special_type, TYPE.SerializedJSON)) {
                let formattedJson = JSON.stringify(JSON.parse(row[1]), null, 2);
                cellValue = (<pre className="ObjectJSON">{formattedJson}</pre>);
            } else if (typeof row[1] === "object") {
                let formattedJson = JSON.stringify(row[1], null, 2);
                cellValue = (<pre className="ObjectJSON">{formattedJson}</pre>);
            } else {
                cellValue = formatValue(row[1], { column: row[0], jsx: true });
                if (typeof cellValue === "string") {
                    cellValue = (<ExpandableString str={cellValue} length={140}></ExpandableString>);
                }
            }

            // NOTE: that the values to our function call look off, but that's because we are un-pivoting them
            if (this.props.cellIsClickableFn(0, rowIndex)) {
                return (<div key={key}><a className="link" onClick={this.cellClicked.bind(null, 0, rowIndex)}>{cellValue}</a></div>);
            } else {
                return (<div key={key}>{cellValue}</div>);
            }
        }
    }

    clickedForeignKey(fk) {
        this.props.followForeignKeyFn(fk);
    }

    renderDetailsTable() {
        var rows = [];
        for (var i=0; i < this.props.data.cols.length; i++) {
            var row = this.rowGetter(i),
                keyCell = this.cellRenderer(row[0], 'field', row, i, 0),
                valueCell = this.cellRenderer(row[1], 'value', row, i, 0);

            rows[i] = (
                <div className="Grid mb2" key={i}>
                    <div className="Grid-cell">{keyCell}</div>
                    <div style={{wordWrap: 'break-word'}} className="Grid-cell text-bold text-dark">{valueCell}</div>
                </div>
            );
        }

        return rows;
    }

    renderRelationships() {
        if (!this.props.tableForeignKeys) return false;

        var tableForeignKeys = this.props.tableForeignKeys.filter(function (fk) {
            return isQueryable(fk.origin.table);
        });

        if (tableForeignKeys.length < 1) {
            return (<p className="my4 text-centered">No relationships found.</p>);
        }

        const fkCountsByTable = foreignKeyCountsByOriginTable(tableForeignKeys);

        var component = this;
        var relationships = tableForeignKeys.sort(function(a, b) {
            return a.origin.table.display_name.localeCompare(b.origin.table.display_name);
        }).map(function(fk) {
            var fkCount = (
                <LoadingSpinner size={25} />
            ),
                fkCountValue = 0,
                fkClickable = false;
            if (component.props.tableForeignKeyReferences) {
                var fkCountInfo = component.props.tableForeignKeyReferences[fk.origin.id];
                if (fkCountInfo && fkCountInfo["status"] === 1) {
                    fkCount = (<span>{fkCountInfo["value"]}</span>);

                    if (fkCountInfo["value"]) {
                        fkCountValue = fkCountInfo["value"];
                        fkClickable = true;
                    }
                }
            }
            var chevron = (
                <IconBorder className="flex-align-right">
                    <Icon name='chevronright' size={10} />
                </IconBorder>
            );

            var relationName = inflect(fk.origin.table.display_name, fkCountValue);
            const via = (fkCountsByTable[fk.origin.table.id] > 1) ? (<span className="text-grey-3 text-normal"> via {fk.origin.display_name}</span>) : null;

            var info = (
                <div>
                    <h2>{fkCount}</h2>
                    <h5 className="block">{relationName}{via}</h5>
                 </div>
            );
            var fkReference;
            var referenceClasses = cx({
                'flex': true,
                'align-center': true,
                'my2': true,
                'pb2': true,
                'border-bottom': true,
                'text-brand-hover': fkClickable,
                'cursor-pointer': fkClickable,
                'text-dark': fkClickable,
                'text-grey-3': !fkClickable
            });

            if (fkClickable) {
                fkReference = (
                    <div className={referenceClasses} key={fk.id} onClick={component.clickedForeignKey.bind(null, fk)}>
                        {info}
                        {chevron}
                    </div>
                );
            } else {
                fkReference = (
                    <div className={referenceClasses} key={fk.id}>
                        {info}
                    </div>
                );
            }

            return (
                <li>
                    {fkReference}
                </li>
            );
        });

        return (
            <ul className="px4">
                {relationships}
            </ul>
        );
    }

    render() {
        if(!this.props.data) {
            return false;
        }

        var tableName = (this.props.tableMetadata) ? singularize(this.props.tableMetadata.display_name) : "Unknown",
            // TODO: once we nail down the "title" column of each table this should be something other than the id
            idValue = this.getIdValue();

        return (
            <div className="ObjectDetail rounded mt2">
                <div className="Grid ObjectDetail-headingGroup">
                    <div className="Grid-cell ObjectDetail-infoMain px4 py3 ml2 arrow-right">
                        <div className="text-brand text-bold">
                            <span>{tableName}</span>
                            <h1>{idValue}</h1>
                        </div>
                    </div>
                    <div className="Grid-cell flex align-center Cell--1of3 bg-alt">
                        <div className="p4 flex align-center text-bold text-grey-3">
                            <Icon name="connections" size={17} />
                            <div className="ml2">
                                This <span className="text-dark">{tableName}</span> is connected to:
                            </div>
                        </div>
                    </div>
                </div>
                <div className="Grid">
                    <div className="Grid-cell ObjectDetail-infoMain p4">{this.renderDetailsTable()}</div>
                    <div className="Grid-cell Cell--1of3 bg-alt">{this.renderRelationships()}</div>
                </div>
            </div>
        );
    }
}
