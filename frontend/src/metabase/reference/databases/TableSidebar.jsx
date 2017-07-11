/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx"

import cx from 'classnames';
import pure from "recompose/pure";

const TableSidebar = ({
    database,
    table,
    style,
    className
}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <div className={S.breadcrumbs}>
            <Breadcrumbs
                className="py4"
                crumbs={[["Databases","/reference/databases"],
                         [database.name, `/reference/databases/${database.id}`],
                         [table.name]]}
                inSidebar={true}
                placeholder="Data Reference"
            />
        </div>
        <ol>
            <SidebarItem key={`/reference/databases/${database.id}/tables/${table.id}`} 
                         href={`/reference/databases/${database.id}/tables/${table.id}`} 
                         icon="document" 
                         name="Details" />
            <SidebarItem key={`/reference/databases/${database.id}/tables/${table.id}/fields`} 
                         href={`/reference/databases/${database.id}/tables/${table.id}/fields`} 
                         icon="fields" 
                         name="Fields in this table" />
            <SidebarItem key={`/reference/databases/${database.id}/tables/${table.id}/questions`} 
                         href={`/reference/databases/${database.id}/tables/${table.id}/questions`} 
                         icon="all" 
                         name="Questions about this table" />
        </ol>
    </div>

TableSidebar.propTypes = {
    database:          PropTypes.object,
    table:          PropTypes.object,
    className:      PropTypes.string,
    style:          PropTypes.object,
};

export default pure(TableSidebar);

