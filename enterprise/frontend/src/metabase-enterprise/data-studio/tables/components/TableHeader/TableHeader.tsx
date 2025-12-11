import { t } from "ttag";

import Link from "metabase/common/components/Link/Link";
import * as Urls from "metabase/lib/urls";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import type { Table } from "metabase-types/api";

import { PaneHeader } from "../../../common/components/PaneHeader";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
};

export function TableHeader({ table }: TableHeaderProps) {
  return (
    <PaneHeader
      data-testid="table-pane-header"
      title={<TableNameInput table={table} />}
      icon="table"
      menu={<TableMoreMenu table={table} />}
      tabs={<TableTabs table={table} />}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link to={Urls.dataStudioLibrary()}>{t`Library`}</Link>
          <span>{t`Data`}</span>
          <span>{table.display_name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}
