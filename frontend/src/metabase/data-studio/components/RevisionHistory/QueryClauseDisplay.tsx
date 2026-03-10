import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TableId } from "metabase-types/api";

import { ClausePill } from "./ClausePill";
import type { DefinitionType } from "./types";

const STAGE_INDEX = -1;

type QueryClauseDisplayProps = {
  definition: DatasetQuery;
  tableId: TableId;
  clauseType: DefinitionType;
};

export function QueryClauseDisplay({
  definition,
  tableId,
  clauseType,
}: QueryClauseDisplayProps) {
  const metadata = useSelector(getMetadata);
  const query = getQuery(definition, tableId, metadata);

  if (!query) {
    return null;
  }

  const clauses =
    clauseType === "filters"
      ? Lib.filters(query, STAGE_INDEX)
      : Lib.aggregations(query, STAGE_INDEX);

  if (clauses.length === 0) {
    return null;
  }

  return (
    <Flex gap="sm" wrap="wrap">
      {clauses.map((clause, index) => (
        <ClausePill key={index} variant={clauseType}>
          {Lib.displayInfo(query, STAGE_INDEX, clause).displayName}
        </ClausePill>
      ))}
    </Flex>
  );
}

function getQuery(
  definition: DatasetQuery | undefined,
  tableId: TableId | undefined,
  metadata: ReturnType<typeof getMetadata>,
) {
  if (!definition) {
    return undefined;
  }

  const databaseId = definition.database;
  if (!databaseId) {
    return undefined;
  }

  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  return Lib.fromJsQuery(metadataProvider, definition);
}
