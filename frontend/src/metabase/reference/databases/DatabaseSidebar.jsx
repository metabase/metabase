/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";
import { t } from "ttag";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import SidebarItem from "metabase/components/SidebarItem";

import cx from "classnames";
import pure from "recompose/pure";

const DatabaseSidebar = ({ database, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div className={S.breadcrumbs}>
        <Breadcrumbs
          className="py4 ml3"
          crumbs={[[t`Databases`, "/reference/databases"], [database.name]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className="mx3">
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

export default pure(DatabaseSidebar);
