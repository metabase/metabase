import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";
import type { Database, Field, Table } from "metabase-types/api";

import { trackReferenceXRayClicked } from "../analytics";

interface FieldSidebarProps {
  database: Database;
  table: Table;
  field: Field;
}

const FieldSidebar = ({ database, table, field }: FieldSidebarProps) => (
  <div className={S.sidebar}>
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
            onClick={() => trackReferenceXRayClicked("field")}
          />
        )}
      </ol>
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(FieldSidebar);
