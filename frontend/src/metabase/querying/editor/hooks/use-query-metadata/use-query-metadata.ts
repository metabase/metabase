import { useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import { useLazyGetAdhocQueryMetadataQuery } from "metabase/api";
import { getPrimarySourceMetadata } from "metabase/querying/common/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useQueryMetadata(question: Question) {
  const [loadMetadata, { error }] = useLazyGetAdhocQueryMetadataQuery();
  const dependenciesRef = useRef<Lib.DependentItem[]>([]);

  const isSourceLoaded = useMemo(() => {
    const query = question.query();
    const hasPrimarySource =
      Lib.primarySourceTableId(query) != null ||
      Lib.primarySourceCardId(query) != null;
    return !hasPrimarySource || getPrimarySourceMetadata(query) != null;
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
