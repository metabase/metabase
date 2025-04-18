import { Badge } from "metabase/components/Badge";
import { browseDatabase, browseSchema } from "metabase/lib/urls";
import type { Table } from "metabase-types/api";

import {
  BreadcrumbsPathSeparator,
  PathContainer,
} from "./TableBreadcrumbs.styled";

interface TableBreadcrumbsProps {
  table: Table;
}

export function TableBreadcrumbs({ table }: TableBreadcrumbsProps) {
  if (!table.db) {
    return null;
  }

  const schemaName =
    typeof table.schema === "string"
      ? table.schema
      : (table.schema as { name: string } | undefined)?.name;
  const separator = <BreadcrumbsPathSeparator>/</BreadcrumbsPathSeparator>;

  return (
    <PathContainer>
      <Badge icon={{ name: "database" }} to={browseDatabase(table.db)}>
        {table.db.name}
      </Badge>
      {schemaName && (
        <>
          {separator}
          <Badge to={browseSchema(table)}>{schemaName}</Badge>
        </>
      )}
      {separator}
      <Badge>{table.display_name}</Badge>
    </PathContainer>
  );
}
