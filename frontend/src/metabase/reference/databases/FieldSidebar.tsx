import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import S from "metabase/reference/components/Sidebar.module.css";
import { SidebarItem } from "metabase/reference/components/SidebarItem";
import MetabaseSettings from "metabase/utils/settings";
import type { DatabaseId, FieldId, TableId } from "metabase-types/api";

import { trackReferenceXRayClicked } from "../analytics";

interface FieldSidebarProps {
  databaseId: DatabaseId;
  databaseName?: string;
  tableId: TableId;
  tableName?: string;
  fieldId: FieldId;
  fieldName?: string;
}

const FieldSidebar = ({
  databaseId,
  databaseName,
  tableId,
  tableName,
  fieldId,
  fieldName,
}: FieldSidebarProps) => (
  <div className={S.sidebar}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
          crumbs={[
            [databaseName, `/reference/databases/${databaseId}`],
            [tableName, `/reference/databases/${databaseId}/tables/${tableId}`],
            [fieldName],
          ]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/databases/${databaseId}/tables/${tableId}/fields/${fieldId}`}
          href={`/reference/databases/${databaseId}/tables/${tableId}/fields/${fieldId}`}
          icon="document"
          name={t`Details`}
        />

        {MetabaseSettings.get("enable-xrays") && (
          <SidebarItem
            key={`/auto/dashboard/field/${fieldId}`}
            href={`/auto/dashboard/field/${fieldId}`}
            icon="bolt"
            name={t`X-ray this field`}
            onClick={() => trackReferenceXRayClicked("field")}
          />
        )}
      </ol>
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(FieldSidebar);
