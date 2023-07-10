import { useMemo } from "react";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

import { getDataTypes } from "./utils";

export const useDataPickerConfig = () => {
  const {
    data: databases = [],
    error: errorDatabases,
    isLoading: isLoadingDatabases,
  } = useDatabaseListQuery({ query: { saved: true } });
  const {
    data: models = [],
    error: errorModels,
    isLoading: isLoadingModels,
  } = useSearchListQuery({ query: { models: "dataset", limit: 1 } });

  const hasModels = models.length > 0;
  const hasSavedQuestions = databases.some(
    database => database.is_saved_questions,
  );
  const hasRawData = databases.some(database => !database.is_saved_questions);
  const hasNestedQueriesEnabled = useSelector(state =>
    getSetting(state, "enable-nested-queries"),
  );

  const dataTypes = useMemo(() => {
    return getDataTypes({
      hasModels,
      hasNestedQueriesEnabled,
      hasSavedQuestions,
      hasRawData,
    });
  }, [hasModels, hasNestedQueriesEnabled, hasRawData, hasSavedQuestions]);

  return {
    databases,
    dataTypes,
    error: errorDatabases || errorModels,
    isLoading: isLoadingDatabases || isLoadingModels,
  };
};
