'use strict';

import ExpandableString from './expandable_string.react';
import FixedDataTable from 'fixed-data-table';
import Icon from './icon.react';

var cx = React.addons.classSet;
var Table = FixedDataTable.Table;
var Column = FixedDataTable.Column;

export default React.createClass({
    displayName: 'QueryVisualizationObjectDetailTable',
    propTypes: {
        data: React.PropTypes.object
    },

    getIdValue: function() {
        if (!this.props.data) return null;

        for (var i=0; i < this.props.data.cols.length; i++) {
            var coldef = this.props.data.cols[i];
            if (coldef.special_type === "id") {
                return this.props.data.rows[0][i];
            }
        }
    },

    rowGetter: function(rowIndex) {
        // Remember that we are pivoting the data, so for row 5 we want to return an array with [coldef, value]
        return [this.props.data.cols[rowIndex], this.props.data.rows[0][rowIndex]];
    },

    cellClicked: function(rowIndex, columnIndex) {
        this.props.cellClickedFn(rowIndex, columnIndex);
    },

    cellRenderer: function(cellData, cellDataKey, rowData, rowIndex, columnData, width) {
        // TODO: should we be casting all values toString()?
        // Check out the expected format of each row above in the rowGetter() function
        var row = this.rowGetter(rowIndex),
            cell,
            key = 'cl'+rowIndex+'_'+cellDataKey;

        if (cellDataKey === 'field') {
            var colValue = (row[0] !== null) ? row[0].name.toString() : null;
            return (<div key={key}>{colValue}</div>);
        } else {

            var cellValue;
            if (row[1] === null || (typeof row[1] === "string" && row[1].length === 0)) {
                cellValue = (<span className="text-grey-2">Empty</span>);

            } else if(row[0].special_type === "json") {
                var formattedJson = JSON.stringify(JSON.parse(row[1]), null, 2);
                cellValue = (<pre>{formattedJson}</pre>);

            } else {
                // TODO: should we be casting all values toString()?
                cellValue = (<ExpandableString str={row[1].toString()} length={140}></ExpandableString>);
            }

            // NOTE: that the values to our function call look off, but that's because we are un-pivoting them
            if (this.props.cellIsClickableFn(0, rowIndex)) {
                return (<div key={key}><a className="link" href="#" onClick={this.cellClicked.bind(null, 0, rowIndex)}>{cellValue}</a></div>);
            } else {
                return (<div key={key}>{cellValue}</div>);
            }
        }
    },

    clickedForeignKey: function(fk) {
        this.props.followForeignKeyFn(fk);
    },

    renderDetailsTable: function() {
        var rows = [];
        for (var i=0; i < this.props.data.cols.length; i++) {
            var row = this.rowGetter(i),
                keyCell = this.cellRenderer(row[0], 'field', row, i, 0),
                valueCell = this.cellRenderer(row[1], 'value', row, i, 0);

            rows[i] = (
                <div className="Grid px4 ml2 mb2" key={i}>
                    <div className="Grid-cell">{keyCell}</div>
                    <div className="Grid-cell text-bold text-dark">{valueCell}</div>
                </div>
            );
        }

        return rows;
    },

    renderRelationships: function() {
        if (!this.props.tableForeignKeys) return false;

        if (this.props.tableForeignKeys.length < 1) {
            return (<p>No relationships found.</p>);
        }

        var component = this;
        var relationships = this.props.tableForeignKeys.map(function(fk) {
            var relationName = (fk.origin.table.entity_name) ? fk.origin.table.entity_name : fk.origin.table.name;

            var fkCount = (<span><Icon name='check' width="12px" height="12px" /></span>),
                fkClickable = false;
            if (component.props.tableForeignKeyReferences) {
                var fkCountInfo = component.props.tableForeignKeyReferences[fk.origin.id];
                if (fkCountInfo && fkCountInfo["status"] === 1) {
                    fkCount = (<span>{fkCountInfo["value"]}</span>);

                    if (fkCountInfo["value"]) {
                        fkClickable = true;
                    }
                }
            }

            var fkReference;
            if (fkClickable) {
                fkReference = (
                    <div key={fk.id} onClick={component.clickedForeignKey.bind(null, fk)}>
                        {fkCount} {relationName} <span className="UserNick"><Icon name='chevronright' width="12px" height="12px" /></span>
                    </div>
                );
            } else {
                fkReference = (
                    <div key={fk.id}>
                        {fkCount} {relationName} <span className="UserNick"><Icon name='chevronright' width="12px" height="12px" /></span>
                    </div>
                );
            }

            return (
                <li className="block mb1 py2 border-bottom text-dark cursor-pointer text-brand-hover">
                    {fkReference}
                </li>
            )
        });

        return (
            <ul className="wrapper">
                {relationships}
            </ul>
        );
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        var tableName = (this.props.tableMetadata) ? this.props.tableMetadata.name : "Unknown",
            // TODO: once we nail down the "title" column of each table this should be something other than the id
            idValue = this.getIdValue();

        return (
            <div className="wrapper wrapper--trim">
                <div className="bordered rounded">
                    <div className="Grid border-bottom">
                        <div className="Grid-cell p4 ml2 border-right">
                            <div className="text-brand text-bol">
                                <span>{tableName}</span>
                                <h1>{idValue}</h1>
                            </div>
                        </div>
                        <div className="Grid-cell flex align-center Cell--1of3 bg-alt">
                            <div className="p4 flex align-center text-bold">
                                <Icon name="connections" width="12px" height="12px" />
                                This <span className="text-dark">{tableName}</span> is connected to.
                            </div>
                        </div>
                    </div>
                    <div className="Grid">
                        <div className="Grid-cell border-right pt4">{this.renderDetailsTable()}</div>
                        <div className="Grid-cell Cell--1of3 bg-alt">{this.renderRelationships()}</div>
                    </div>
                </div>
            </div>
        );
    }
});
