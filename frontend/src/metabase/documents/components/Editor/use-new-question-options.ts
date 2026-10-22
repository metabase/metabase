import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { getHasDatabaseWithJsonEngine } from "metabase/databases/utils/predicates";
import { useSelector } from "metabase/redux";
import type { NewQuestionOption } from "metabase/rich_text_editing/tiptap/extensions/Command/types";

export const useNewQuestionOptions = (): NewQuestionOption[] => {
  const { data } = useListDatabasesQuery();
  const databases = useMemo(() => data?.data ?? [], [data]);
  const hasDatabaseWithJsonEngine = getHasDatabaseWithJsonEngine(databases);
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

  return useMemo(() => {
    const options: NewQuestionOption[] = [];

    if (hasDataAccess) {
      options.push({
        label: t`New Question`,
        icon: "insight",
        value: "notebook",
      });
    }

    if (hasNativeWrite) {
      options.push({
        label: hasDatabaseWithJsonEngine
          ? t`New Native query`
          : t`New SQL query`,
        icon: "sql",
        value: "native",
      });
    }

    return options;
  }, [hasDataAccess, hasDatabaseWithJsonEngine, hasNativeWrite]);
};
