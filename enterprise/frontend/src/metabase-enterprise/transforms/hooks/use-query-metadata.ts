import { useRef } from "react";
import { useAsync } from "react-use";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

export function useQueryMetadata(datasetQuery: DatasetQuery) {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();
  const dependenciesRef = useRef<Lib.DependentItem[]>([]);
  const isLoadedRef = useRef(false);

  const { loading } = useAsync(async () => {
    const question = Question.create({
      dataset_query: datasetQuery,
      metadata,
    });
    const dependencies = Lib.dependentMetadata(
      question.query(),
      undefined,
      question.type(),
    );
    if (!_.isEqual(dependencies, dependenciesRef.current)) {
      dependenciesRef.current = dependencies;
      await dispatch(Questions.actions.fetchAdhocMetadata(datasetQuery));
    }
  }, [datasetQuery]);

  if (!loading) {
    isLoadedRef.current = true;
  }

  return { isLoaded: isLoadedRef.current };
}
