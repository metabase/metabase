/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import S from "metabase/components/Sidebar.module.css";
import SidebarItem from "metabase/components/SidebarItem";
import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";

const TableSidebar = ({ database, table, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <div>
      <Breadcrumbs
        className={cx(CS.py4, CS.ml3)}
        crumbs={[
          [t`Databases`, "/reference/databases"],
          [database.name, `/reference/databases/${database.id}`],
          [table.name],
        ]}
        inSidebar={true}
        placeholder={t`Data Reference`}
      />
    </div>
    <ol className={CS.mx3}>
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}`}
        href={`/reference/databases/${database.id}/tables/${table.id}`}
        icon="document"
        name={t`Details`}
      />
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}/fields`}
        href={`/reference/databases/${database.id}/tables/${table.id}/fields`}
        icon="field"
        name={t`Fields in this table`}
      />
      <SidebarItem
        key={`/reference/databases/${database.id}/tables/${table.id}/questions`}
        href={`/reference/databases/${database.id}/tables/${table.id}/questions`}
        icon="folder"
        name={t`Questions about this table`}
      />
      {MetabaseSettings.get("enable-xrays") && (
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
};

export default memo(TableSidebar);
