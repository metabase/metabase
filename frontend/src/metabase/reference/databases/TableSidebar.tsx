import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import S from "metabase/reference/components/Sidebar.module.css";
import { SidebarItem } from "metabase/reference/components/SidebarItem";
import MetabaseSettings from "metabase/utils/settings";
import type { DatabaseId, TableId } from "metabase-types/api";

import { trackReferenceXRayClicked } from "../analytics";

interface TableSidebarProps {
  databaseId: DatabaseId;
  databaseName?: string;
  tableId: TableId;
  tableName?: string;
}

const TableSidebar = ({
  databaseId,
  databaseName,
  tableId,
  tableName,
}: TableSidebarProps) => (
  <div className={S.sidebar}>
    <div>
      <Breadcrumbs
        className={cx(CS.py4, CS.ml3)}
        crumbs={[
          [t`Databases`, "/reference/databases"],
          [databaseName, `/reference/databases/${databaseId}`],
          [tableName],
        ]}
        inSidebar={true}
        placeholder={t`Data Reference`}
      />
    </div>
    <ol className={CS.mx3}>
      <SidebarItem
        key={`/reference/databases/${databaseId}/tables/${tableId}`}
        href={`/reference/databases/${databaseId}/tables/${tableId}`}
        icon="document"
        name={t`Details`}
      />
      <SidebarItem
        key={`/reference/databases/${databaseId}/tables/${tableId}/fields`}
        href={`/reference/databases/${databaseId}/tables/${tableId}/fields`}
        icon="field"
        name={t`Fields in this table`}
      />
      <SidebarItem
        key={`/reference/databases/${databaseId}/tables/${tableId}/questions`}
        href={`/reference/databases/${databaseId}/tables/${tableId}/questions`}
        icon="folder"
        name={t`Questions about this table`}
      />
      {MetabaseSettings.get("enable-xrays") && (
        <SidebarItem
          key={`/auto/dashboard/table/${tableId}`}
          href={`/auto/dashboard/table/${tableId}`}
          icon="bolt"
          name={t`X-ray this table`}
          onClick={() => trackReferenceXRayClicked("table")}
        />
      )}
    </ol>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(TableSidebar);
