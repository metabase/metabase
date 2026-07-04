import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderProps,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { Button, Group } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
} & Omit<PaneHeaderProps, "breadcrumbs">;

function getExploreUrl(table: Table) {
  return (
    Urls.modelToUrl({
      id: Number(table.id),
      name: table.name,
      model: "table",
      database: { id: table.db_id },
    }) ?? "#"
  );
}

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
      tabs={
        <Group justify="space-between" align="center" wrap="nowrap" w="100%">
          <TableTabs table={table} />
          <Button
            component={ForwardRefLink}
            to={getExploreUrl(table)}
            aria-label={t`Explore`}
          >
            {t`Explore`}
          </Button>
        </Group>
      }
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
