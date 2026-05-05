import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";
import type { Database } from "metabase-types/api";

interface DatabaseSidebarProps {
  database: Database;
}

const DatabaseSidebar = ({ database }: DatabaseSidebarProps) => (
  <div className={S.sidebar}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(DatabaseSidebar);
