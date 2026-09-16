import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import {
  DataStudioPaneHeader,
  type DataStudioPaneHeaderProps,
} from "metabase/data-studio/app/components/DataStudioPaneHeader";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
} & Omit<DataStudioPaneHeaderProps, "breadcrumbs">;

export function TableHeader({ table, ...rest }: TableHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: table.collection_id,
  });
  return (
    <DataStudioPaneHeader
      data-testid="table-pane-header"
      title={<TableNameInput table={table} />}
      icon="table"
      menu={<TableMoreMenu table={table} />}
      tabs={<TableTabs table={table} />}
      {...rest}
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          {path?.map((collection, i) => (
            <Link
              key={collection.id}
              to={Urls.dataStudioLibrary({
                expandedIds: path.slice(1, i + 1).map((c) => c.id),
              })}
            >
              {collection.name}
            </Link>
          ))}
          <span>{table.display_name}</span>
        </DataStudioBreadcrumbs>
      }
    />
  );
}
