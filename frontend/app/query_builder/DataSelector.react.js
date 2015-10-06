import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import AccordianList from "./AccordianList.react";

import { isQueryable } from 'metabase/lib/table';

import _ from "underscore";

export default class DataSelector extends Component {
    constructor(props) {
        super(props);

        _.bindAll(this, "onChange", "itemIsSelected", "sectionIsSelected");
    }

    onChange(item) {
        if (item.database != null) {
            this.props.setDatabaseFn(item.database.id);
        }
        if (item.table != null) {
            this.props.setSourceTableFn(item.table.id);
        }
        this.refs.popover.toggle();
    }

    sectionIsSelected(section, sectionIndex) {
        if (this.props.includeTables) {
            return section.items[0].database.id === this.getDatabaseId();
        } else {
            return true;
        }
    }

    itemIsSelected(item) {
        if (this.props.includeTables) {
            return item.table.id === this.getTableId();
        } else {
            return item.database.id === this.getDatabaseId();
        }
    }

    getDatabaseId() {
        return this.props.query.database;
    }

    getTableId() {
        return this.props.query.query && this.props.query.query.source_table;
    }

    render() {
        let dbId = this.getDatabaseId();
        let tableId = this.getTableId();
        var database = _.find(this.props.databases, (db) => db.id === dbId);
        var table = _.find(database.tables, (table) => table.id === tableId);

        var content;
        if (this.props.includeTables) {
            if (table) {
                content = <span className="text-grey no-decoration">{table.display_name}</span>;
            } else {
                content = <span className="text-grey-4 no-decoration">Select a table</span>;
            }
        } else {
            if (database) {
                content = <span className="text-grey no-decoration">{database.name}</span>;
            } else {
                content = <span className="text-grey-4 no-decoration">Select a database</span>;
            }
        }

        var triggerElement = (
            <span className="px2 py2 text-bold cursor-pointer text-default">
                {content}
                <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
            </span>
        )

        let sections;
        if (this.props.includeTables) {
            sections = this.props.databases.map(database => ({
                name: database.name,
                items: database.tables.filter(isQueryable).map(table => ({
                    name: table.display_name,
                    database: database,
                    table: table
                }))
            }))
        } else {
            sections = [{
                items: this.props.databases.map(database => ({
                    name: database.name,
                    database: database
                }))
            }];
        }

        return (
            <div className={"GuiBuilder-section GuiBuilder-data flex align-center " + this.props.className}>
                <span className="GuiBuilder-section-label Query-label">{this.props.name}</span>
                <PopoverWithTrigger
                    ref="popover"
                    className="PopoverBody PopoverBody--withArrow"
                    isInitiallyOpen={this.props.isInitiallyOpen}
                    triggerElement={triggerElement}
                    triggerClasses="flex align-center"
                    tetherOptions={{
                        attachment: 'top left',
                        targetAttachment: 'bottom left',
                        targetOffset: '5px 0'
                    }}
                >
                    <AccordianList
                        className="text-brand"
                        sections={sections}
                        onChange={this.onChange}
                        sectionIsSelected={this.sectionIsSelected}
                        itemIsSelected={this.itemIsSelected}
                    />
                </PopoverWithTrigger>
            </div>
        );
    }
}

DataSelector.propTypes = {
    query: React.PropTypes.object.isRequired,
    databases: React.PropTypes.array.isRequired,
    setDatabaseFn: React.PropTypes.func.isRequired,
    setSourceTableFn: React.PropTypes.func,
    isInitiallyOpen: React.PropTypes.bool,
    name: React.PropTypes.string
};

DataSelector.defaultProps = {
    name: "Data",
    className: "",
    isInitiallyOpen: false,
    includeTables: false
};
