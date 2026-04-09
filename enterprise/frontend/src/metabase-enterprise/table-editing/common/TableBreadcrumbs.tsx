import { useMemo } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { HeadBreadcrumbs } from "metabase/query_builder/components/view/ViewHeader/components";
import type { DataSourcePart } from "metabase/query_builder/components/view/ViewHeader/components/QuestionDataSource/utils";
import { ViewHeading } from "metabase/query_builder/components/view/ViewSection";
import type { Database, Table } from "metabase-types/api";

type TableBreadcrumbsProps = {
  database: Database;
  table: Table;
  showEditBreadcrumb?: boolean;
};

export const TableBreadcrumbs = ({
  database,
  table,
  showEditBreadcrumb = false,
}: TableBreadcrumbsProps) => {
  const parts = useMemo(() => {
    const parts: DataSourcePart[] = [
      {
        icon: "database" as const,
        model: "database" as const,
        name: database.name,
        href: Urls.browseDatabase(database),
      },
      {
        icon: "table" as const,
        model: "table" as const,
        name: table.display_name,
        href: Urls.tableRowsQuery(database.id, table.id),
      },
    ];

    if (showEditBreadcrumb) {
      parts.push({
        name: t`Edit`,
      });
    }

    return parts;
  }, [database, table, showEditBreadcrumb]);

  return (
    <ViewHeading c="text-secondary">
      <HeadBreadcrumbs parts={parts} variant="head" />
    </ViewHeading>
  );
};
