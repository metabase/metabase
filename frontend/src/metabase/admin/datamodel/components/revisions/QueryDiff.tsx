import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import CS from "metabase/css/core/index.css";
import type { DatasetQuery } from "metabase-types/api";

interface QueryDiffProps {
  diff: {
    before?: DatasetQuery;
    after?: DatasetQuery;
  };
  tableId: number;
}

export function QueryDiff({
  diff: { before, after },
  tableId,
}: QueryDiffProps) {
  const definition = after ?? before;
  if (!definition) {
    return null;
  }
  return (
    <QueryDefinition
      className={CS.my1}
      definition={definition}
      tableId={tableId}
    />
  );
}
