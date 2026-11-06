import { useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import { useLazyGetAdhocQueryMetadataQuery } from "metabase/api";
import {
  getPrimarySourceMetadata,
  hasPrimarySource,
} from "metabase/querying/common/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useQueryMetadata(question: Question) {
  const [loadMetadata, { error }] = useLazyGetAdhocQueryMetadataQuery();
  const dependenciesRef = useRef<Lib.DependentItem[]>([]);

  const isSourceLoaded = useMemo(() => {
    const query = question.query();
    return !hasPrimarySource(query) || getPrimarySourceMetadata(query) != null;
  }, [question]);

  useEffect(() => {
    const dependencies = Lib.dependentMetadata(
      question.query(),
      undefined,
      question.type(),
    );
    if (!_.isEqual(dependencies, dependenciesRef.current)) {
      dependenciesRef.current = dependencies;
      loadMetadata(question.datasetQuery(), true);
    }
  }, [question, loadMetadata]);

  return {
    isLoading: !isSourceLoaded,
    error,
  };
}
