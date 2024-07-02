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

const FieldSidebar = ({ database, table, field, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
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
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`}
          href={`/reference/databases/${database.id}/tables/${table.id}/fields/${field.id}`}
          icon="document"
          name={t`Details`}
        />

        {MetabaseSettings.get("enable-xrays") && (
          <SidebarItem
            key={`/auto/dashboard/field/${field.id}`}
            href={`/auto/dashboard/field/${field.id}`}
            icon="bolt"
            name={t`X-ray this field`}
          />
        )}
      </ol>
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

export default memo(FieldSidebar);
