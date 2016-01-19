import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import AccordianList from "./AccordianList.jsx";

import { isQueryable } from 'metabase/lib/table';

import _ from "underscore";

export default class DataSelector extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "onChange", "itemIsSelected", "renderSectionIcon", "renderItemIcon");
    }

    static propTypes = {
        query: PropTypes.object.isRequired,
        databases: PropTypes.array.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        setSourceTableFn: PropTypes.func,
        isInitiallyOpen: PropTypes.bool
    };

    static defaultProps = {
        isInitiallyOpen: false,
        includeTables: false
    };

    onChange(item) {
        if (item.database != null) {
            this.props.setDatabaseFn(item.database.id);
        }
        if (item.table != null) {
            this.props.setSourceTableFn(item.table.id);
        }
        this.refs.popover.toggle();
    }

    itemIsSelected(item) {
        if (this.props.includeTables) {
            return item.table.id === this.getTableId();
        } else {
            return item.database.id === this.getDatabaseId();
        }
    }

    renderSectionIcon() {
        return <Icon name="database" width="18" height="18" />
    }

    renderItemIcon() {
        return <Icon name="table2" width="18" height="18" />
    }

    getDatabaseId() {
        return this.props.query.database;
    }

    getTableId() {
        return this.props.query.query && this.props.query.query.source_table;
    }

    render() {
        const { databases } = this.props;

        let dbId = this.getDatabaseId();
        let tableId = this.getTableId();
        var database = _.find(databases, (db) => db.id === dbId);
        var table = _.find(database.tables, (table) => table.id === tableId);

        var content;
        if (this.props.includeTables) {
            if (table) {
                content = <span className="text-grey no-decoration">{table.display_name || table.name}</span>;
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
        let initiallyOpenSection;
        if (this.props.includeTables) {
            sections = databases.map(database => ({
                name: database.name,
                items: database.tables.filter(isQueryable).map(table => ({
                    name: table.display_name || table.name,
                    database: database,
                    table: table
                })).sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                })
            }));
            if (database) {
                initiallyOpenSection = databases.indexOf(database);
            }
        } else {
            sections = [{
                items: databases.map(database => ({
                    name: database.name,
                    database: database
                }))
            }];
        }

        return (
            <PopoverWithTrigger
                ref="popover"
                isInitiallyOpen={this.props.isInitiallyOpen}
                triggerElement={triggerElement}
                triggerClasses="flex align-center"
            >
                <AccordianList
                    className="text-brand"
                    sections={sections}
                    onChange={this.onChange}
                    itemIsSelected={this.itemIsSelected}
                    renderSectionIcon={this.renderSectionIcon}
                    renderItemIcon={this.renderItemIcon}
                    initiallyOpenSection={initiallyOpenSection}
                />
            </PopoverWithTrigger>
        );
    }
}
