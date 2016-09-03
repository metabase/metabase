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

const PermissionsAPI = new AngularResourceProxy("Permissions", ["updateDatabasePermissions", "createSchemaPermissions", "deleteSchemaPermissions"]);


// ------------------------------------------------------------ Permissions Slider ------------------------------------------------------------

function PermissionsSliderChoice({ title, description, selected, onClick }) {
    return (
        <div className={cx("p2 text-centered cursor-pointer", { "Button--primary": selected })}
             onClick={selected ? null : onClick}>
            <h3>
                {title}
            </h3>
            <div className="my1 text-grey-2">
                {description}
            </div>
        </div>
    );
}

function PermissionsSlider({ selectedOption, onClickOption }) {
    return (
        <div className="my4">
            <h3 className="text-bold pb2">
                Permissions for this database
            </h3>
            <div className="flex flex-full full-width">
                <PermissionsSliderChoice title="Unrestricted" description="All schemas and SQL editor"
                                         selected={selectedOption === "unrestricted"} onClick={onClickOption.bind(null, "unrestricted")}
                />
                <PermissionsSliderChoice title="All schemas" description="But no SQL editor"
                                         selected={selectedOption === "all_schemas"} onClick={onClickOption.bind(null, "all_schemas")}
                />
                <PermissionsSliderChoice title="Some schemas" description="Only the ones you specify"
                                         selected={selectedOption === "some_schemas"} onClick={onClickOption.bind(null, "some_schemas")}
                />
                <PermissionsSliderChoice title="No access" description="No schemas for you!"
                                         selected={selectedOption === "no_access"} onClick={onClickOption.bind(null, "no_access")}
                />
            </div>
        </div>
    );
}


// ------------------------------------------------------------ Schemas Table ------------------------------------------------------------

// editable = whether the table is editable

function SchemasTableRow({ perms, schema, editable, onSchemaToggled }) {
    return (
        <tr>
            <td>
                {editable ? (
                     <CheckBox className="inline-block mr2" checked={schema.access_type && schema.access_type !== "no_access"} onChange={onSchemaToggled.bind(null, schema)} />
                 ) : null}
                {schema.name}
            </td>
            <td>
                {schema.access_type === "all_tables" ? "All tables" :
                 schema.access_type === "some_tables" ? "Some tables" : "No access"}
            </td>
            <td>
                {editable && schema.access_type && schema.access_type !== "no_access" ? (
                     <Link to={"/admin/permissions/databases/" + perms.database_id + "/groups/" + perms.group_id + "/schema/" + schema.name}
                           className="link text-bold no-decoraction"
                     >
                         Edit
                     </Link>
                 ) : null}
            </td>
        </tr>
    );
}

function SchemasTable({ perms, schemas, editable, onSchemaToggled }) {
    return (
        <AdminContentTable columnTitles={["Accessible schemas", "Table permissions"]}>
            {schemas && schemas.map((schema, index) =>
                <SchemasTableRow perms={perms} key={index} schema={schema} editable={editable} onSchemaToggled={onSchemaToggled} />
             )}
        </AdminContentTable>
    );
}


// ------------------------------------------------------------ Logic ------------------------------------------------------------

/// replace schema with matching name in SCHEMAS with NEWSCHEMA
function updateSchema(schemas, newSchema) {
    let newSchemas = _.reject(schemas, (schema) => schema.name === newSchema.name);
    newSchemas = _.union(newSchemas, [newSchema]);
    return _.sortBy(newSchemas, (schema) => schema.name && schema.name.toLowerCase());
}

export default class DatabasePermissions extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            databasePermissions: null
        };
    }

    onClickOption(newOption) {
        const perms = this.props.databasePermissions;

        PermissionsAPI.updateDatabasePermissions({groupID: perms.group_id, databaseID: perms.database_id, access_type: newOption}).then((function(newPerms) {
            this.setState({
                databasePermissions: newPerms
            });
        }).bind(this), function(error) {
            console.error("Error updating database permissions:", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    addSchemaPermissions(schema) {
        const perms = this.getPerms();

        PermissionsAPI.createSchemaPermissions({databaseID: perms.database_id, groupID: perms.group_id, schema: schema.name}).then((function () {
            console.log("Schema permissions created!");

            let newSchema = _.clone(schema);
            newSchema.access_type = "all_tables";
            let newPerms = _.clone(perms);
            newPerms.schemas = updateSchema(perms.schemas, newSchema);

            this.setState({
                databasePermissions: newPerms
            });

        }).bind(this), function(error) {
            console.error("Error creating schema permissions: ", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    removeSchemaPermissions(schema) {
        const perms = this.getPerms();

        PermissionsAPI.deleteSchemaPermissions({databaseID: perms.database_id, groupID: perms.group_id, schema: schema.name}).then((function () {
            console.log("Schema permissions deleted!");

            let newSchema = _.clone(schema);
            newSchema.access_type = "no_access";
            let newPerms = _.clone(perms);
            newPerms.schemas = updateSchema(perms.schemas, newSchema);

            this.setState({
                databasePermissions: newPerms
            });

        }).bind(this), function(error) {
            console.error("Error removing schema permissions: ", error);
            if (error.data && typeof error.data === "string") alert(error.data);
        });
    }

    onSchemaToggled(schema) {
        if (!schema.access_type || schema.access_type === "no_access") {
            this.addSchemaPermissions(schema);
        } else {
            this.removeSchemaPermissions(schema);
        }
    }

    // when someone modifies the permissions keep the modified version in state and use that so long as the DB ID / group ID are correct
    // TODO - this is almost certainly the wrong way to do this
    getPerms() {
        const propsPerms = this.props.databasePermissions || {};
        const statePerms = this.state.databasePermissions;
        const statePermsAreValid = statePerms && statePerms.group_id === propsPerms.group_id && statePerms.database_id === propsPerms.database_id;

        return  statePermsAreValid ? statePerms : propsPerms;
    }

    render() {
        let { location: { pathname }, databases, groups } = this.props;

        const perms = this.getPerms();

        return (
            <Permissions leftNavPane={<DatabasesLeftNavPane databases={databases} currentPath={pathname} />}>
                <DatabaseGroupSelector groups={groups} selectedGroupID={perms.group_id} databaseID={perms.database_id} />
                <PermissionsSlider selectedOption={perms.access_type} onClickOption={this.onClickOption.bind(this)} />
                {perms.access_type !== "no_access" ? (
                     <SchemasTable perms={perms} schemas={perms.schemas} editable={perms.access_type === "some_schemas"} onSchemaToggled={this.onSchemaToggled.bind(this)} />
                ) : null}
            </Permissions>
        );
    }
}
