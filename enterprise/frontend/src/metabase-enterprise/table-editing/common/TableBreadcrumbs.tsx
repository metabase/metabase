import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import { HeadBreadcrumbs } from "metabase/query_builder/components/view/ViewHeader/components"; // TODO: we should not use query builder components
import type { DataSourcePart } from "metabase/query_builder/components/view/ViewHeader/components/QuestionDataSource/utils"; // TODO: we should not use query builder components
import { ViewHeading } from "metabase/query_builder/components/view/ViewSection"; // TODO: we should not use query builder components
import type DatabaseV1 from "metabase-lib/v1/metadata/Database";
import type TableV1 from "metabase-lib/v1/metadata/Table";
import type { Database, Table } from "metabase-types/api";

import { getTableViewUrl } from "../urls";

type TableBreadcrumbsProps = {
  database: Pick<DatabaseV1 | Database, "id" | "name"> | undefined;
  table: TableV1 | Table | undefined;
  isEditMode?: boolean;
};

export const TableBreadcrumbs = ({
  database,
  table,
  isEditMode,
}: TableBreadcrumbsProps) => {
  const breadcrumbsParts = useMemo(
    () =>
      database && table
        ? getBreadcrumbsParts({
            database,
            table,
            isEditMode,
          })
        : [],
    [database, isEditMode, table],
  );

  return (
    <ViewHeading color="medium">
      <HeadBreadcrumbs parts={breadcrumbsParts} variant="head" />
    </ViewHeading>
  );
};

const getBreadcrumbsParts = ({
  database,
  table,
  isEditMode = false,
}: {
  database: Pick<DatabaseV1 | Database, "id" | "name">;
  table: TableV1 | Table;
  isEditMode?: boolean;
}): DataSourcePart[] => {
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
      href: isEditMode ? getTableViewUrl(table) : undefined,
    },
    isEditMode
      ? {
          get name() {
            return t`Edit`;
          },
        }
      : null,
  ].filter(isNotNull);

  return parts;
};
