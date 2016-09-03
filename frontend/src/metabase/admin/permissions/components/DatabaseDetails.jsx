import React from "react";
import { Link } from "react-router";

import Tooltip from "metabase/components/Tooltip.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";

import AdminContentTable from "./AdminContentTable.jsx";
import DatabasesLeftNavPane from "./DatabasesLeftNavPane.jsx";
import DatabaseGroupSelector from "./DatabaseGroupSelector.jsx";
import Permissions from "./Permissions.jsx";


function SchemaItemGroupItem({ databaseID, group, database, color }) {
    if (!group.access) return null;
    return (
        <Tooltip tooltip={group.name + " — " + group.access}>
            <Link to={"/admin/permissions/databases/" + database.id + "/groups/" + group.id}>
                <span className="text-white inline-block mx1">
                    <UserAvatar background={color} user={{first_name: group.name}} />
                </span>
            </Link>
        </Tooltip>
    );
}

function SchemaItemGroups({ groups, database }) {
    const COLORS = ['bg-error', 'bg-purple', 'bg-brand', 'bg-gold', 'bg-green'];
    return (
        <div>
            {groups && groups.map((group, index) =>
                <SchemaItemGroupItem key={index} group={group} database={database} color={COLORS[(index % COLORS.length)]} />
             )}
        </div>
    );
}

function SchemaItem({ schema, database }) {
    return (
        <tr>
            <td>{schema.name}</td>
            <td><SchemaItemGroups groups={schema.groups} database={database} /></td>
        </tr>
    );
}

function SchemasTable({ schemas, database }) {
    return (
        <AdminContentTable columnTitles={["Schemas", "Groups that can view"]}>
            {schemas && schemas.map((schema, index) =>
                <SchemaItem key={index} schema={schema} database={database} />
             )}
        </AdminContentTable>
    );
}

export default function DatabaseDetails({ location: { pathname }, database, databases, groups }) {
    database = database || {};
    databases = databases || [];

    return (
        <Permissions leftNavPane={<DatabasesLeftNavPane databases={databases} currentPath={pathname} />}>
            <DatabaseGroupSelector groups={groups} databaseID={database.id} />
            <SchemasTable schemas={database.schemas} database={database} />
        </Permissions>
    );
}
