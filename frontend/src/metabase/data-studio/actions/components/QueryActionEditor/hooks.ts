import { useMemo } from "react";

import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

export function useActionQuery(datasetQuery: DatasetQuery): Lib.Query {
  const metadataProvider = useMetadataProvider(datasetQuery.database);
  return useMemo(
    () => Lib.fromJsQuery(metadataProvider, datasetQuery),
    [metadataProvider, datasetQuery],
  );
}
