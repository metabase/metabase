import { useMemo } from "react";
import { Link } from "react-router";

import { skipToken, useGetTableQuery } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import { Anchor } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface TablePathProps {
  tableId: TableId | null | undefined;
}

export function TablePath({ tableId }: TablePathProps) {
  const { data: table } = useGetTableQuery(
    tableId != null ? { id: tableId } : skipToken,
  );

  const parts = useMemo(() => {
    if (!table || !table.db) {
      return null;
    }

    const pathParts = [];

    if (table.db.name) {
      pathParts.push({
        name: table.db.name,
        url: Urls.dataModelDatabase(table.db_id),
      });
    }

    if (table.schema) {
      pathParts.push({
        name: table.schema,
        url: Urls.dataModelSchema(table.db_id, table.schema),
      });
    }

    if (table.display_name) {
      pathParts.push({
        name: table.display_name,
        url: Urls.dataModelTable(table.db_id, table.schema, table.id),
      });
    }

    return pathParts.length > 0 ? pathParts : null;
  }, [table]);

  if (!parts) {
    return null;
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={part.url}>
          {index > 0 && " / "}
          <Anchor component={Link} to={part.url} c="text-primary" fw={700}>
            {part.name}
          </Anchor>
        </span>
      ))}
    </>
  );
}
