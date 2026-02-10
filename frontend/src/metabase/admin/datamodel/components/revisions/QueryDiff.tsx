import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import CS from "metabase/css/core/index.css";
import type { DatasetQuery, TableId } from "metabase-types/api";

type Props = {
  diff: {
    before?: DatasetQuery;
    after?: DatasetQuery;
  };
  tableId: TableId;
};

export function QueryDiff({ diff: { before, after }, tableId }: Props) {
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
