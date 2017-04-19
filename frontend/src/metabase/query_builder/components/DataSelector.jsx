import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import AccordianList from "metabase/components/AccordianList.jsx";

import { isQueryable } from 'metabase/lib/table';
import { titleize, humanize } from 'metabase/lib/formatting';

import _ from "underscore";
import cx from "classnames";

export default class DataSelector extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            databases: null,
            selectedSchema: null,
            showTablePicker: true,
            showSegmentPicker: props.segments && props.segments.length > 0
        }

        _.bindAll(this, "onChangeDatabase", "onChangeSchema", "onChangeTable", "onChangeSegment", "onBack");
    }

    static propTypes = {
        datasetQuery: PropTypes.object.isRequired,
        databases: PropTypes.array.isRequired,
        tables: PropTypes.array,
        segments: PropTypes.array,
        disabledTableIds: PropTypes.array,
        disabledSegmentIds: PropTypes.array,
        setDatabaseFn: PropTypes.func.isRequired,
        setSourceTableFn: PropTypes.func,
        setSourceSegmentFn: PropTypes.func,
        isInitiallyOpen: PropTypes.bool
    };

    static defaultProps = {
        isInitiallyOpen: false,
        includeTables: false
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
        if (this.props.databases.length === 1 && !this.props.segments) {
            setTimeout(() => this.onChangeDatabase(0));
        }
    }

    componentWillReceiveProps(newProps) {
        let tableId = newProps.datasetQuery.query && newProps.datasetQuery.query.source_table;
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
        if (item.table != null) {
            this.props.setSourceTableFn(item.table.id);
        } else if (item.database != null) {
            this.props.setDatabaseFn(item.database.id);
        }
        this.refs.popover.toggle();
    }

    onChangeSegment(item) {
        if (item.segment != null) {
            this.props.setSourceSegmentFn(item.segment.id);
        }

        this.refs.popover.toggle();
    }

    onChangeSchema(schema) {
        this.setState({
            selectedSchema: schema,
            showTablePicker: true
        });
    }

    onChangeSegmentSection() {
        this.setState({
            showSegmentPicker: true
        });
    }

    onBack() {
        this.setState({
            showTablePicker: false,
            showSegmentPicker: false
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

    getSegmentId() {
        return this.props.datasetQuery.segment;
    }

    getDatabaseId() {
        return this.props.datasetQuery.database;
    }

    getTableId() {
        return this.props.datasetQuery.query && this.props.datasetQuery.query.source_table;
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
                id="DatabasePicker"
                key="schemaPicker"
                className="text-brand"
                sections={sections}
                onChange={this.onChangeTable}
                itemIsSelected={(item) => this.getDatabaseId() === item.database.id}
                renderItemIcon={() => <Icon className="Icon text-default" name="database" size={18} />}
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
                id="DatabaseSchemaPicker"
                key="schemaPicker"
                className="text-brand"
                sections={sections}
                onChange={this.onChangeSchema}
                onChangeSection={this.onChangeDatabase}
                itemIsSelected={(schema) => this.state.selectedSchema === schema}
                renderSectionIcon={() => <Icon className="Icon text-default" name="database" size={18} />}
                renderItemIcon={() => <Icon name="folder" size={16} />}
                initiallyOpenSection={openSection}
                showItemArrows={true}
                alwaysTogglable={true}
            />
        );
    }

    renderSegmentAndDatabasePicker() {
        const { selectedSchema } = this.state;

        const segmentItem = [{ name: 'Segments', items: [], icon: 'segment'}];

        const sections = segmentItem.concat(this.state.databases.map(database => {
            return {
                name: database.name,
                items: database.schemas.length > 1 ? database.schemas : []
            };
        }));

        // FIXME: this seems a bit brittle and hard to follow
        let openSection = selectedSchema && (_.findIndex(this.state.databases, (db) => _.find(db.schemas, selectedSchema)) + segmentItem.length);
        if (openSection >= 0 && this.state.databases[openSection - segmentItem.length] && this.state.databases[openSection - segmentItem.length].schemas.length === 1) {
            openSection = -1;
        }

        return (
            <AccordianList
                key="schemaPicker"
                className="text-brand"
                sections={sections}
                onChange={this.onChangeSchema}
                onChangeSection={(index) => index === 0 ?
                    this.onChangeSegmentSection() :
                    this.onChangeDatabase(index - segmentItem.length)
                }
                itemIsSelected={(schema) => this.state.selectedSchema === schema}
                renderSectionIcon={(section, sectionIndex) => <Icon className="Icon text-default" name={section.icon || "database"} size={18} />}
                renderItemIcon={() => <Icon name="folder" size={16} />}
                initiallyOpenSection={openSection}
                showItemArrows={true}
                alwaysTogglable={true}
            />
        );
    }

    renderTablePicker() {
        const schema = this.state.selectedSchema;

        const hasMultipleDatabases = this.props.databases.length > 1;
        const hasMultipleSchemas = schema && schema.database && _.uniq(schema.database.tables, (t) => t.schema).length > 1;
        const hasSegments = !!this.props.segments;
        const hasMultipleSources = hasMultipleDatabases || hasMultipleSchemas || hasSegments;

        let header = (
            <span className="flex align-center">
                <span className={cx("flex align-center text-slate", { "cursor-pointer": hasMultipleSources })} onClick={hasMultipleSources && this.onBack}>
                    { hasMultipleSources && <Icon name="chevronleft" size={18} /> }
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
                items: schema.tables
                    .map(table => ({
                        name: table.display_name,
                        disabled: this.props.disabledTableIds && this.props.disabledTableIds.includes(table.id),
                        table: table,
                        database: schema.database
                    }))
            }];
            return (
                <AccordianList
                    id="TablePicker"
                    key="tablePicker"
                    className="text-brand"
                    sections={sections}
                    searchable={true}
                    onChange={this.onChangeTable}
                    itemIsSelected={(item) => item.table ? item.table.id === this.getTableId() : false}
                    itemIsClickable={(item) => item.table && !item.disabled}
                    renderItemIcon={(item) => item.table ? <Icon name="table2" size={18} /> : null}
                    hideSingleSectionTitle={true}
                />
            );
        }
    }

    //TODO: refactor this. lots of shared code with renderTablePicker()
    renderSegmentPicker() {
        const { segments } = this.props;
        const header = (
            <span className="flex align-center">
                <span className="flex align-center text-slate cursor-pointer" onClick={this.onBack}>
                    <Icon name="chevronleft" size={18} />
                    <span className="ml1">Segments</span>
                </span>
            </span>
        );

        if (!segments || segments.length === 0) {
            return (
                <section className="List-section List-section--open" style={{width: '300px'}}>
                    <div className="p1 border-bottom">
                        <div className="px1 py1 flex align-center">
                            <h3 className="text-default">{header}</h3>
                        </div>
                    </div>
                    <div className="p4 text-centered">No segments were found.</div>
                </section>
            );
        }

        const sections = [{
            name: header,
            items: segments
                .map(segment => ({
                    name: segment.name,
                    segment: segment,
                    disabled: this.props.disabledSegmentIds && this.props.disabledSegmentIds.includes(segment.id)
                }))
        }];

        return (
            <AccordianList
                key="segmentPicker"
                className="text-brand"
                sections={sections}
                searchable={true}
                searchPlaceholder="Find a segment"
                onChange={this.onChangeSegment}
                itemIsSelected={(item) => item.segment ? item.segment.id === this.getSegmentId() : false}
                itemIsClickable={(item) => item.segment && !item.disabled}
                renderItemIcon={(item) => item.segment ? <Icon name="segment" size={18} /> : null}
                hideSingleSectionTitle={true}
            />
        );
    }

    render() {
        const { databases } = this.props;

        let dbId = this.getDatabaseId();
        let tableId = this.getTableId();
        var database = _.find(databases, (db) => db.id === dbId);
        var table = _.find(database && database.tables, (table) => table.id === tableId);

        var content;
        if (this.props.includeTables && this.props.segments) {
            const segmentId = this.getSegmentId();
            const segment = _.find(this.props.segments, (segment) => segment.id === segmentId);
            if (table) {
                content = <span className="text-grey no-decoration">{table.display_name || table.name}</span>;
            } else if (segment) {
                content = <span className="text-grey no-decoration">{segment.name}</span>;
            } else {
                content = <span className="text-grey-4 no-decoration">Pick a segment or table</span>;
            }
        } else if (this.props.includeTables) {
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
            <span className={this.props.className || "px2 py2 text-bold cursor-pointer text-default"} style={this.props.style}>
                {content}
                <Icon className="ml1" name="chevrondown" size={this.props.triggerIconSize || 8}/>
            </span>
        )

        return (
            <PopoverWithTrigger
                id="DataPopover"
                ref="popover"
                sizeToFit
                isInitiallyOpen={this.props.isInitiallyOpen}
                triggerElement={triggerElement}
                triggerClasses="flex align-center"
                horizontalAttachments={this.props.segments ? ["center", "left", "right"] : ["left"]}
            >
                { !this.props.includeTables ?
                    this.renderDatabasePicker() :
                    this.state.selectedSchema && this.state.showTablePicker ?
                        this.renderTablePicker() :
                        this.props.segments ?
                            this.state.showSegmentPicker ?
                                this.renderSegmentPicker() :
                                this.renderSegmentAndDatabasePicker() :
                            this.renderDatabaseSchemaPicker()
                }
            </PopoverWithTrigger>
        );
    }
}
