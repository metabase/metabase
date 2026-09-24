import { useCallback } from "react";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import { selectMetadataProvider } from "metabase/metadata-store";
import { useDispatch, useStore } from "metabase/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { checkLoadedQuery, parseMbqlInput } from "../graph";

type Options = {
  question: Question;
  onLoaded: (query: Lib.Query) => void;
};

// Turns pasted MBQL into a query with its metadata loaded, and hands back an
// error message when it cannot be used.
export function useLoadMbql({ question, onLoaded }: Options) {
  const store = useStore();
  const dispatch = useDispatch();

  return useCallback(
    async (text: string): Promise<string | null> => {
      const input = parseMbqlInput(text, question.databaseId());
      if ("error" in input) {
        return input.error;
      }
      const { datasetQuery } = input;
      // Same call the query builder makes to load a new question's metadata.
      try {
        await dispatch(
          datasetApi.endpoints.getAdhocQueryMetadata.initiate(datasetQuery, {
            forceRefetch: false,
          }),
        ).unwrap();
      } catch {
        return t`Could not load the metadata this query needs.`;
      }
      let query: Lib.Query;
      try {
        query = Lib.fromJsQuery(
          selectMetadataProvider(store.getState(), datasetQuery.database),
          datasetQuery,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return t`This MBQL could not be loaded: ${detail}`;
      }
      const problem = checkLoadedQuery(query);
      if (problem != null) {
        return problem;
      }
      onLoaded(query);
      return null;
    },
    [question, dispatch, store, onLoaded],
  );
}
