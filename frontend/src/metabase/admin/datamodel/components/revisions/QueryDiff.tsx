import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import CS from "metabase/css/core/index.css";
import type { QueryDiff as QueryDiffType, TableId } from "metabase-types/api";

type Props = {
  diff: QueryDiffType;
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
