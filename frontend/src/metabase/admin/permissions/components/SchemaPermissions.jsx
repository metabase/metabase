import React, { Component } from "react";
import { Link } from "react-router";

import _ from "underscore";
import cx from "classnames";

import { AngularResourceProxy } from "metabase/lib/redux";

import CheckBox from "metabase/components/CheckBox.jsx";

import AdminContentTable from "./AdminContentTable.jsx";
import DatabasesLeftNavPane from "./DatabasesLeftNavPane.jsx";
import DatabaseGroupSelector from "./DatabaseGroupSelector.jsx";
import Permissions from "./Permissions.jsx";

const PermissionsAPI = new AngularResourceProxy("Permissions", ["updateSchemaPermissions", "createTablePermissions", "deleteTablePermissions"]);

// ------------------------------------------------------------ Breadcrumbs ------------------------------------------------------------

function Breadcrumb({ database, groupID, schema }) {
    return (
        <div className="py4 h3 text-bold">
            <Link to={"/admin/permissions/databases/" + database.id + "/groups/" + groupID} className="link no-decoration">
                {database.name}
                <span className="mx2">
                    &gt;
                </span>
            </Link>
            {schema}
        </div>
    );
}


// ------------------------------------------------------------ Access Type Selector ------------------------------------------------------------

function AccessTypeSelector({ accessType, onChangeAccessType }) {
    const unrestricted = accessType === "unrestricted";
    return (
        <div className="my4">
            <div className="h5 text-grey-3">
                TABLE PERMISSIONS FOR THIS SCHEMA
            </div>
            <p className={cx({"text-brand": unrestricted, "cursor-pointer": !unrestricted})}
                 onClick={!unrestricted ? onChangeAccessType.bind(null, "unrestricted") : null}
            >
                All tables, including ones added later
            </p>
            <p className={cx({"text-brand": !unrestricted, "cursor-pointer": unrestricted})}
                 onClick={unrestricted ? onChangeAccessType.bind(null, "some_tables") : null}
            >
                Only the tables I select
            </p>
        </div>
    );
}


// ------------------------------------------------------------ Tables Table ------------------------------------------------------------

function TablesTableRow({ table, editable, onTableToggled }) {
    return (
        <tr>
            <td>
                {editable ? (
                     <CheckBox className="inline-block mr2" checked={table.access_type !== "no_access"} onChange={onTableToggled.bind(null, table)} />
                 ) : null}
                {table.name}
            </td>
        </tr>
    );
}

function TablesTable({ tables, editable, onTableToggled }) {
    return (
        <AdminContentTable columnTitles={["Accessible tables"]}>
            {tables && tables.map((table, index) =>
                <TablesTableRow key={index} table={table} editable={editable} onTableToggled={onTableToggled} />
             )}
        </AdminContentTable>
    );
}


// ------------------------------------------------------------ Logic ------------------------------------------------------------

export default class SchemaPermssions extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            schemaPermissions: null
        };
    }

    onChangeAccessType(newAccessType) {
        const groupID = Number.parseInt(this.props.params.groupID);
        const databaseID = Number.parseInt(this.props.params.databaseID);
        const schema = this.props.params.schema;

        PermissionsAPI.updateSchemaPermissions({databaseID: databaseID,
                                                groupID: groupID,
                                                schema: schema,
                                                unrestricted_table_access: newAccessType === "unrestricted"}, (function (newSchemaPermissions) {
            this.setState({
                schemaPermissions: newSchemaPermissions
            });

        }).bind(this), function(error) {
            console.error("Error updating schema permissions:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    createTablePermissions(tablePermissions) {
        const groupID = Number.parseInt(this.props.params.groupID);

        PermissionsAPI.createTablePermissions({tableID: tablePermissions.table_id,
                                               groupID: groupID}).then((function (newPermissions) {
            tablePermissions.id = newPermissions.id;
            tablePermissions.access_type = "all_fields";
            this.forceUpdate();
        }).bind(this), function(error) {
            console.error("Error creating TablePermissions:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    deleteTablePermissions(tablePermissions) {
        const groupID = Number.parseInt(this.props.params.groupID);

        PermissionsAPI.deleteTablePermissions({tableID: tablePermissions.table_id,
                                               groupID: groupID
        }).then((function () {
            tablePermissions.id = null;
            tablePermissions.access_type = "no_access";
            this.forceUpdate();
        }).bind(this), function(error) {
            console.error("Error deleting TablePermissions:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    onTableToggled(tablePermissions) {
        if (!tablePermissions.id) {
            this.createTablePermissions(tablePermissions);
        } else {
            this.deleteTablePermissions(tablePermissions);
        }
    }

    render() {
        let { location: { pathname }, params: { databaseID, groupID, schema }, databases, groups, schemaPermissions } = this.props;

        schemaPermissions = this.state.schemaPermissions || schemaPermissions || {};

        if (databaseID) databaseID = Number.parseInt(databaseID);
        if (groupID)    groupID    = Number.parseInt(groupID);

        const database = _.findWhere(databases, {id: databaseID}) || {};

        return (
            <Permissions leftNavPane={<DatabasesLeftNavPane databases={databases} currentPath={pathname} />}>
                <DatabaseGroupSelector groups={groups} selectedGroupID={groupID} databaseID={databaseID} />
                <Breadcrumb database={database} groupID={groupID} schema={schema} />
                <AccessTypeSelector accessType={schemaPermissions.access_type}
                                    onChangeAccessType={this.onChangeAccessType.bind(this)}
                />
                <TablesTable tables={schemaPermissions.tables} editable={schemaPermissions.access_type !== "unrestricted"}
                             onTableToggled={this.onTableToggled.bind(this)}
                />
            </Permissions>
        );
    }
}
