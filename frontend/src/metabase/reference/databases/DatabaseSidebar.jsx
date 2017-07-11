/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx"

import cx from 'classnames';
import pure from "recompose/pure";

const DatabaseSidebar = ({
    database,
    style,
    className
}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            <div className={S.breadcrumbs}>
                <Breadcrumbs
                    className="py4"
                    crumbs={[["Databases","/reference/databases"],
                             [database.name]]}
                    inSidebar={true}
                    placeholder="Data Reference"
                />
            </div>
                <SidebarItem key={`/reference/databases/${database.id}`} 
                             href={`/reference/databases/${database.id}`} 
                             icon="document" 
                             name="Details" />
                <SidebarItem key={`/reference/databases/${database.id}/tables`} 
                             href={`/reference/databases/${database.id}/tables`} 
                             icon="table2" 
                             name={`Tables in ${database.name}`} />
        </ul>
    </div>
DatabaseSidebar.propTypes = {
    database:          PropTypes.object,
    className:      PropTypes.string,
    style:          PropTypes.object,
};

export default pure(DatabaseSidebar);

