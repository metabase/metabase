/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";
import pure from "recompose/pure";

import MetabaseSettings from "metabase/lib/settings";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import SidebarItem from "metabase/components/SidebarItem";

import S from "metabase/components/Sidebar.css";

const FieldSidebar = ({ database, table, field, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div className={S.breadcrumbs}>
        <Breadcrumbs
          className="py4"
          crumbs={[
            [database.name, `/reference/databases/${database.id}`],
            [
              table.name,
              `/reference/databases/${database.id}/tables/${table.id}`,
            ],
            [field.name],
          ]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}/fields/${
          field.id
        }`}
        href={`/reference/databases/${database.id}/tables/${table.id}/fields/${
          field.id
        }`}
        icon="document"
        name={t`Details`}
      />

      {MetabaseSettings.get("enable_xrays") && (
        <SidebarItem
          key={`/auto/dashboard/field/${field.id}`}
          href={`/auto/dashboard/field/${field.id}`}
          icon="bolt"
          name={t`X-ray this field`}
        />
      )}
    </ul>
  </div>
);

FieldSidebar.propTypes = {
  database: PropTypes.object,
  table: PropTypes.object,
  field: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default pure(FieldSidebar);
