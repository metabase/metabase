import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import { useLazyGetAdhocQueryMetadataQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useQueryMetadata(question: Question) {
  const [loadMetadata, { isLoading }] = useLazyGetAdhocQueryMetadataQuery();
  const dependenciesRef = useRef<Lib.DependentItem[]>([]);
  const [isInitiallyLoaded, setIsInitiallyLoaded] = useState(false);

  useEffect(() => {
    const dependencies = Lib.dependentMetadata(
      question.query(),
      undefined,
      question.type(),
    );
    if (!_.isEqual(dependencies, dependenciesRef.current)) {
      dependenciesRef.current = dependencies;
      loadMetadata(question.datasetQuery());
    }
  }, [question, loadMetadata]);

  if (!isInitiallyLoaded) {
    const query = question.query();
    const sourceTableId = Lib.sourceTableOrCardId(query);
    const sourceTable =
      sourceTableId != null
        ? Lib.tableOrCardMetadata(query, sourceTableId)
        : null;
    if (!isLoading && (sourceTableId == null || sourceTable != null)) {
      setIsInitiallyLoaded(true);
    }
  }

  return { isInitiallyLoaded };
}
