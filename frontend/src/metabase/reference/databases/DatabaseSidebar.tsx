import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import S from "metabase/reference/components/Sidebar.module.css";
import { SidebarItem } from "metabase/reference/components/SidebarItem";
import type { DatabaseId } from "metabase-types/api";

interface DatabaseSidebarProps {
  databaseId: DatabaseId;
  databaseName?: string;
}

const DatabaseSidebar = ({
  databaseId,
  databaseName,
}: DatabaseSidebarProps) => (
  <div className={S.sidebar}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
          crumbs={[[t`Databases`, "/reference/databases"], [databaseName]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/databases/${databaseId}`}
          href={`/reference/databases/${databaseId}`}
          icon="document"
          name={t`Details`}
        />
        <SidebarItem
          key={`/reference/databases/${databaseId}/tables`}
          href={`/reference/databases/${databaseId}/tables`}
          icon="table2"
          name={t`Tables in ${databaseName}`}
        />
      </ol>
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(DatabaseSidebar);
