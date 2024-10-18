import { useSelector } from "metabase/lib/redux";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useHiddenSourceTables(
  question: Question,
): Lib.TableDisplayInfo[] {
  const datasetQuery = question.datasetQuery();
  const metadata = useSelector(getMetadataUnfiltered);
  const metadataProvider = Lib.metadataProvider(
    datasetQuery.database,
    metadata,
  );
  const query = Lib.fromLegacyQuery(
    datasetQuery.database,
    metadataProvider,
    datasetQuery,
  );

  const sourceTableId = Lib.sourceTableOrCardId(query);

  const joinTablesInfo = Lib.stageIndexes(query).flatMap(stageIndex =>
    Lib.joins(query, stageIndex)
      .map(join => Lib.joinedThing(query, join))
      .filter(joinTable => joinTable != null)
      .map(joinTable => Lib.displayInfo(query, stageIndex, joinTable)),
  );

  if (sourceTableId) {
    const sourceTableMetadata = Lib.tableOrCardMetadata(
      metadataProvider,
      sourceTableId,
    );
    const sourceTableInfo = Lib.displayInfo(query, -1, sourceTableMetadata);
    joinTablesInfo.unshift(sourceTableInfo);
  }

  return joinTablesInfo.filter(
    tableInfo =>
      tableInfo.visibilityType !== null &&
      tableInfo.visibilityType !== "normal",
  );
}
