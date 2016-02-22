import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import AccordianList from "./AccordianList.jsx";

import { isQueryable } from 'metabase/lib/table';
import { titleize, humanize } from 'metabase/lib/formatting';

import _ from "underscore";

export default class DataSelector extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            databases: null,
            selectedSchema: null,
            showTablePicker: true
        }

        _.bindAll(this, "onChangeDatabase", "onChangeSchema", "onChangeTable", "onBack");
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

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let tableId = newProps.query.query && newProps.query.query.source_table;
        let selectedSchema;
        // augment databases with schemas
        let databases = newProps.databases && newProps.databases.map(database => {
            let schemas = {};
            for (let table of database.tables.filter(isQueryable)) {
                let name = table.schema || "";
                schemas[name] = schemas[name] || {
                    name: titleize(humanize(name)),
                    database: database,
                    tables: []
                }
                schemas[name].tables.push(table);
                if (table.id === tableId) {
                    selectedSchema = schemas[name];
                }
            }
            schemas = Object.values(schemas);
            // Hide the schema name if there is only one schema
            if (schemas.length === 1) {
                schemas[0].name = "";
            }
            return {
                ...database,
                schemas: schemas.sort((a, b) => a.name.localeCompare(b.name))
            };
        });
        this.setState({ databases });
        if (selectedSchema != undefined) {
            this.setState({ selectedSchema,  })
        }
    }

    onChangeTable(item) {
        if (item.database != null) {
            this.props.setDatabaseFn(item.database.id);
        }
        if (item.table != null) {
            this.props.setSourceTableFn(item.table.id);
        }
        this.refs.popover.toggle();
    }

    onChangeSchema(schema) {
        this.setState({
            selectedSchema: schema,
            showTablePicker: true
        });
    }

    onBack() {
        this.setState({
            showTablePicker: false
        });
    }

    onChangeDatabase(index) {
        let database = this.state.databases[index];
        let schema = database && (database.schemas.length > 1 ? null : database.schemas[0]);
        if (database && database.tables.length === 0) {
            schema = {
                database: database,
                name: "",
                tables: []
            };
        }
        this.setState({
            selectedSchema: schema,
            showTablePicker: !!schema
        });
    }

    getDatabaseId() {
        return this.props.query.database;
    }

    getTableId() {
        return this.props.query.query && this.props.query.query.source_table;
    }

    renderDatabasePicker() {
        let sections = [{
            items: this.state.databases.map(database => ({
                name: database.name,
                database: database
            }))
        }];

        return (
            <AccordianList
                key="schemaPicker"
                className="text-brand"
                sections={sections}
                onChange={this.onChangeTable}
                itemIsSelected={(item) => this.getDatabaseId() === item.database.id}
                renderItemIcon={() => <Icon className="Icon text-default" name="database" width="18" height="18" />}
                showItemArrows={false}
            />
        );
    }

    renderDatabaseSchemaPicker() {
        const { selectedSchema } = this.state;

        let sections = this.state.databases.map(database => {
            return {
                name: database.name,
                items: database.schemas.length > 1 ? database.schemas : []
            };
        });

        let openSection = selectedSchema && _.findIndex(this.state.databases, (db) => _.find(db.schemas, selectedSchema));
        if (openSection >= 0 && this.state.databases[openSection] && this.state.databases[openSection].schemas.length === 1) {
            openSection = -1;
        }

        return (
            <AccordianList
                key="schemaPicker"
                className="text-brand"
                sections={sections}
                onChange={this.onChangeSchema}
                onChangeSection={this.onChangeDatabase}
                itemIsSelected={(schema) => this.state.selectedSchema === schema}
                renderSectionIcon={() => <Icon className="Icon text-default" name="database" width="18" height="18" />}
                renderItemIcon={() => <Icon name="folder" width="16" height="16" />}
                initiallyOpenSection={openSection}
                showItemArrows={true}
                alwaysTogglable={true}
            />
        );
    }

    renderTablePicker() {
        const schema = this.state.selectedSchema;
        let header = (
            <span className="flex align-center">
                <span className="flex align-center text-slate cursor-pointer" onClick={this.onBack}>
                    <Icon name="chevronleft" width={18} height={18} />
                    <span className="ml1">{schema.database.name}</span>
                </span>
                { schema.name &&
                    <span><span className="mx1">-</span>{schema.name}</span>
                }
            </span>
        );

        if (schema.tables.length === 0) {
            // this is a database with no tables!
            return (
                <section className="List-section List-section--open" style={{width: '300px'}}>
                    <div className="p1 border-bottom">
                        <div className="px1 py1 flex align-center">
                            <h3 className="text-default">{header}</h3>
                        </div>
                    </div>
                    <div className="p4 text-centered">No tables found in this database.</div>
                </section>
            );

        } else {
            let sections = [{
                name: header,
                items: schema.tables.map(table => ({
                    name: table.display_name,
                    table: table,
                    database: schema.database
                }))
            }];
            return (
                <AccordianList
                    key="tablePicker"
                    className="text-brand"
                    sections={sections}
                    onChange={this.onChangeTable}
                    itemIsSelected={(item) => item.table ? item.table.id === this.getTableId() : false}
                    itemIsClickable={(item) => item.table}
                    renderItemIcon={(item) => item.table ? <Icon name="table2" width="18" height="18" /> : null}
                />
            );
        }
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

        return (
            <PopoverWithTrigger
                ref="popover"
                isInitiallyOpen={this.props.isInitiallyOpen}
                triggerElement={triggerElement}
                triggerClasses="flex align-center"
                horizontalAttachments={["left"]}
            >
                { !this.props.includeTables ?
                    this.renderDatabasePicker()
                : this.state.selectedSchema && this.state.showTablePicker ?
                    this.renderTablePicker()
                :
                    this.renderDatabaseSchemaPicker()
                }
            </PopoverWithTrigger>
        );
    }
}
