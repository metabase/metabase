import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api/database";

import { doesDatabaseSupportTransforms } from "../utils";

export const useTransformSupportedDbs = () => {
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const transformsDatabases = useMemo(() => {
    return databases?.data.filter((d) => doesDatabaseSupportTransforms(d));
  }, [databases]);

  return {
    transformsDatabases,
    isLoadingDatabases,
    databasesError,
  };
};
