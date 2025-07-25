import { useRef, useState } from "react";
import { useAsync } from "react-use";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function useQueryMetadata(question: Question) {
  const dispatch = useDispatch();
  const dependenciesRef = useRef<Lib.DependentItem[]>([]);
  const [isInitiallyLoaded, setIsInitiallyLoaded] = useState(false);

  const { loading } = useAsync(async () => {
    const dependencies = Lib.dependentMetadata(
      question.query(),
      undefined,
      question.type(),
    );
    if (!_.isEqual(dependencies, dependenciesRef.current)) {
      dependenciesRef.current = dependencies;
      await dispatch(
        Questions.actions.fetchAdhocMetadata(question.datasetQuery()),
      );
    }
  }, [question]);

  if (!isInitiallyLoaded && !loading) {
    setIsInitiallyLoaded(true);
  }

  return { isInitiallyLoaded };
}
