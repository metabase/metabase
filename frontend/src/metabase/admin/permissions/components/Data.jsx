import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";

import Permissions from "./Permissions.jsx";
import TopLevelLeftNavPane from "./TopLevelLeftNavPane.jsx";

function Title() {
    return (
        <section className="PageHeader clearfix">
            <h2 className="PageTitle">
                Databases
            </h2>
        </section>
    );
}

function DatabaseListItem( { database }) {
    return (
        <li>
            <Link to={"/admin/permissions/databases/" + database.id} className="no-decoration">
                <Icon className="Icon text-grey-1" name="database" size={24} />
                <span className="mx4 text-bold">
                    {database.name}
                </span>
            </Link>
        </li>
    );
}

function Data ({ location: { pathname }, databases }) {
    return (
        <Permissions leftNavPane={<TopLevelLeftNavPane currentPath={pathname} />}>
            <Title />
            <ul>
                {databases && databases.map((database, index) => (
                     <DatabaseListItem key={index} database={database} />
                 ))}
            </ul>
        </Permissions>
    );
}

export default Data;
