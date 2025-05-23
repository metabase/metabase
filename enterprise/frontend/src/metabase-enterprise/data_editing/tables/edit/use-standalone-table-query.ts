import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import {
  deserializeTableFilter,
  serializeTableFilter,
} from "metabase-enterprise/data_editing/tables/edit/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { StructuredDatasetQuery } from "metabase-types/api";

type StandaloneTableQueryProps = {
  tableId: number;
  databaseId: number;
  location: Location<{ filter?: string }>;
};

export const useStandaloneTableQuery = ({
  tableId,
  databaseId,
  location,
}: StandaloneTableQueryProps) => {
  const filterQueryParam = useMemo(() => {
    return location.query?.filter
      ? deserializeTableFilter(location.query.filter)
      : null;
  }, [location.query.filter]);

  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const table = metadata.table(tableId);

  useEffect(() => {
    dispatch(loadMetadataForTable(tableId));
  }, [dispatch, tableId]);

  const fakeTableQuestion = useMemo(() => {
    if (table) {
      let question = Question.create({ databaseId, tableId, metadata });

      if (filterQueryParam) {
        const legacyQuery = Lib.toLegacyQuery(
          question.query(),
        ) as StructuredDatasetQuery;
        legacyQuery.query.filter = filterQueryParam;
        question = question.setDatasetQuery(legacyQuery);
      }

      return question;
    }
  }, [databaseId, filterQueryParam, metadata, tableId, table]);

  const handleQuestionChange = useCallback(
    (newQuestion: Question) => {
      const legacyQuery = Lib.toLegacyQuery(
        newQuestion.query(),
      ) as StructuredDatasetQuery;
      const newFilterMbql = legacyQuery.query.filter;

      if (newFilterMbql) {
        const searchParams = new URLSearchParams();
        searchParams.append("filter", serializeTableFilter(newFilterMbql));
        // don't set filter param if it is empty
        dispatch(
          push(`${window.location.pathname}?${searchParams.toString()}`),
        );
      } else {
        dispatch(push(window.location.pathname));
      }
    },
    [dispatch],
  );

  const fakeTableQuery = useMemo(() => {
    if (fakeTableQuestion) {
      return Lib.toLegacyQuery(fakeTableQuestion.query());
    }
  }, [fakeTableQuestion]);

  return {
    fakeTableQuestion,
    fakeTableQuery,
    table,
    handleQuestionChange,
  };
};
