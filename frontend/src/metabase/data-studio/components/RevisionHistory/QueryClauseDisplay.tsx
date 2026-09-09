import { useMetadataProvider } from "metabase/metadata-store";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import { ClausePill } from "./ClausePill";
import type { DefinitionType } from "./types";

const STAGE_INDEX = -1;

type QueryClauseDisplayProps = {
  definition: DatasetQuery;
  clauseType: DefinitionType;
};

export function QueryClauseDisplay({
  definition,
  clauseType,
}: QueryClauseDisplayProps) {
  const metadataProvider = useMetadataProvider(definition?.database ?? null);
  const query = getQuery(definition, metadataProvider);

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
  metadataProvider: Lib.MetadataProvider,
) {
  if (!definition?.database) {
    return undefined;
  }

  return Lib.fromJsQuery(metadataProvider, definition);
}
