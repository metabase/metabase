/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const TableSidebar = ({ database, table, style, className, showXray }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <div className={S.breadcrumbs}>
      <Breadcrumbs
        className="py4"
        crumbs={[
          [t`Databases`, "/reference/databases"],
          [database.name, `/reference/databases/${database.id}`],
          [table.name],
        ]}
        inSidebar={true}
        placeholder={t`Data Reference`}
      />
    </div>
    <ol>
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}`}
        href={`/reference/databases/${database.id}/tables/${table.id}`}
        icon="document"
        name={t`Details`}
      />
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}/fields`}
        href={`/reference/databases/${database.id}/tables/${table.id}/fields`}
        icon="fields"
        name={t`Fields in this table`}
      />
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}/questions`}
        href={`/reference/databases/${database.id}/tables/${
          table.id
        }/questions`}
        icon="all"
        name={t`Questions about this table`}
      />
      <SidebarItem
        key={`/auto/dashboard/table/${table.id}`}
        href={`/auto/dashboard/table/${table.id}`}
        icon="bolt"
        name={t`X-ray this table`}
      />
      {showXray && (
        <SidebarItem
          key={`/xray/table/${table.id}/approximate`}
          href={`/xray/table/${table.id}/approximate`}
          icon="beaker"
          name={t`See an in-depth analysis`}
        />
      )}
    </ol>
  </div>
);

TableSidebar.propTypes = {
  database: PropTypes.object,
  table: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
  showXray: PropTypes.bool,
};

export default pure(TableSidebar);
