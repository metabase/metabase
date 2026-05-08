import { useCallback, useState } from "react";

import { useGetIcon } from "metabase/hooks/use-icon";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const DEFAULT_LIST_LIMIT = 5;

export const useExpandableList = (arr: any[], limit = DEFAULT_LIST_LIMIT) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = () => setIsExpanded((val) => !val);
  const filtered = isExpanded ? arr : arr.slice(0, limit);
  return { isExpanded, toggle, filtered };
};

export const useGetJoinedTablesWithIcons = () => {
  const getIcon = useGetIcon();

  return useCallback(
    (question: Question) => {
      const query = question?.query();
      const stageIndexes = Lib.stageIndexes(query);

      const joinedTables = stageIndexes.flatMap((stageIndex) => {
        const joins = Lib.joins(query, stageIndex);

        return joins.flatMap((join) => {
          const thing = Lib.joinedThing(query, join);
          const href = getUrl({ query, table: thing, stageIndex });
          if (!href) {
            return [];
          }
          const { displayName } = Lib.displayInfo(query, stageIndex, thing);
          return [{ name: displayName, href }];
        });
      });

      return joinedTables.map((source) => ({
        ...source,
        iconProps: getIcon({ model: "table" }),
      }));
    },
    [getIcon],
  );
};
