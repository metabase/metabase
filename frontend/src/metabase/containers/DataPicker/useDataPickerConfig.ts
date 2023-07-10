import { useMemo } from "react";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getHasDataAccess } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";

import { getDataTypes } from "./utils";

export const useDataPickerConfig = () => {
  const {
    data: allDatabases = [],
    error: errorDatabases,
    isLoading: isLoadingDatabases,
  } = useDatabaseListQuery({ query: { saved: true } });
  const {
    data: models,
    error: errorModals,
    isLoading: isLoadingModels,
  } = useSearchListQuery({ query: { models: "dataset", limit: 1 } });

  const databases = useMemo(
    () => allDatabases.filter(database => !database.is_saved_questions),
    [allDatabases],
  );

  const hasModels = models ? models.length > 0 : false;
  const hasSavedQuestions = databases.some(
    database => database.is_saved_questions,
  );
  const hasNestedQueriesEnabled = useSelector(state =>
    getSetting(state, "enable-nested-queries"),
  );

  const dataTypes = useMemo(() => {
    return getDataTypes({
      hasModels,
      hasSavedQuestions,
      hasNestedQueriesEnabled,
    });
  }, [hasModels, hasSavedQuestions, hasNestedQueriesEnabled]);

  return {
    databases,
    dataTypes,
    hasDataAccess: getHasDataAccess(allDatabases),
    error: errorDatabases || errorModals,
    isLoading: isLoadingDatabases || isLoadingModels,
  };
};
