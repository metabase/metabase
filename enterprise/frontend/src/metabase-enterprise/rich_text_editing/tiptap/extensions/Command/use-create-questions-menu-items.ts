import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";

import type { NewQuestionMenuItem } from "./types";

export const useCreateQuestionsMenuItems = ({
  onSelectItem,
}: {
  onSelectItem: (item: "notebook" | "native") => void;
}) => {
  const { data } = useListDatabasesQuery();
  const databases = useMemo(() => data?.data ?? [], [data]);
  const hasDataAccess = useMemo(() => getHasDataAccess(databases), [databases]);
  const hasNativeWrite = useMemo(
    () => getHasNativeWrite(databases),
    [databases],
  );

  const hasDatabaseWithJsonEngine = getHasDatabaseWithJsonEngine(databases);

  const items = useMemo(() => {
    const result: NewQuestionMenuItem[] = [];

    if (hasDataAccess) {
      result.push({
        label: t`New Question`,
        icon: "insight",
        value: "notebook" as const,
        action: () => onSelectItem("notebook"),
      });
    }

    if (hasNativeWrite) {
      result.push({
        label: hasDatabaseWithJsonEngine
          ? t`New Native query`
          : t`New SQL query`,
        icon: "sql",
        value: "native" as const,
        action: () => onSelectItem("native"),
      });
    }

    return result;
  }, [hasDataAccess, hasDatabaseWithJsonEngine, hasNativeWrite, onSelectItem]);

  return items;
};
