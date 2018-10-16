/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import { connect } from "react-redux";
import cx from "classnames";
import pure from "recompose/pure";

import { getXraysEnabled } from "metabase/admin/settings/selectors";

import S from "metabase/components/Sidebar.css";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx";

const TableSidebar = ({ database, table, style, className, xraysEnabled }) => (
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
      {xraysEnabled && (
        <SidebarItem
          key={`/auto/dashboard/table/${table.id}`}
          href={`/auto/dashboard/table/${table.id}`}
          icon="bolt"
          name={t`X-ray this table`}
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
  xraysEnabled: PropTypes.bool,
};

export default connect(state => ({ xraysEnabled: getXraysEnabled(state) }))(
  pure(TableSidebar),
);
