import { getIcon } from "metabase/lib/icon";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const getJoinedTablesWithIcons = (question: Question) => {
  const query = question?.query();

  const stageIndexes = Lib.stageIndexes(query);

  const joinedTables = stageIndexes.flatMap((stageIndex) => {
    const joins = Lib.joins(query, stageIndex);

    const joinedThings = joins.flatMap((join) => {
      const thing = Lib.joinedThing(query, join);
      if (!thing) {
        return [];
      }
      const url = getUrl({ query, table: thing, stageIndex }) as string;
      const { displayName } = Lib.displayInfo(query, stageIndex, thing);
      return [{ name: displayName, href: url }];
    });
    return joinedThings;
  });

  return joinedTables.map((source) => ({
    ...source,
    iconProps: getIcon({ model: "table" }),
  }));
};
