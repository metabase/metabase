import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import { getPrimarySourceMetadata } from "metabase/querying/common/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useHiddenSourceTables(
  question: Question,
): Lib.TableDisplayInfo[] {
  const datasetQuery = question.datasetQuery();
  const metadataProvider = useMetadataProviderUnfiltered(datasetQuery.database);
  const query = Lib.fromJsQuery(metadataProvider, datasetQuery);

  const joinTablesInfo = Lib.stageIndexes(query).flatMap((stageIndex) =>
    Lib.joins(query, stageIndex)
      .map((join) => Lib.joinedThing(query, join))
      .filter((joinTable) => joinTable != null)
      .map((joinTable) => Lib.displayInfo(query, stageIndex, joinTable)),
  );

  const sourceTableMetadata = getPrimarySourceMetadata(query);
  if (sourceTableMetadata) {
    const sourceTableInfo = Lib.displayInfo(query, -1, sourceTableMetadata);
    joinTablesInfo.unshift(sourceTableInfo);
  }

  return joinTablesInfo.filter(
    (tableInfo) =>
      !tableInfo.isSourceTable || tableInfo.visibilityType !== null,
  );
}
