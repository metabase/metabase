/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import S from "metabase/components/Sidebar.module.css";
import SidebarItem from "metabase/components/SidebarItem";
import CS from "metabase/css/core/index.css";

const DatabaseSidebar = ({ database, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
          crumbs={[[t`Databases`, "/reference/databases"], [database.name]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/databases/${database.id}`}
          href={`/reference/databases/${database.id}`}
          icon="document"
          name={t`Details`}
        />
        <SidebarItem
          key={`/reference/databases/${database.id}/tables`}
          href={`/reference/databases/${database.id}/tables`}
          icon="table2"
          name={t`Tables in ${database.name}`}
        />
      </ol>
    </ul>
  </div>
);
DatabaseSidebar.propTypes = {
  database: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default memo(DatabaseSidebar);
