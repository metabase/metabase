import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderProps,
} from "metabase/data-studio/common/components/PaneHeader";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/lib/urls";
import type { Table } from "metabase-types/api";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
} & Omit<PaneHeaderProps, "breadcrumbs">;

export function TableHeader({ table, ...rest }: TableHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: table.collection_id,
  });
  return (
    <PaneHeader
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
