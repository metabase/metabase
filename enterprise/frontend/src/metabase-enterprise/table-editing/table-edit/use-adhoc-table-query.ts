import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { StructuredDatasetQuery } from "metabase-types/api";

import {
  deserializeTableFilter,
  deserializeTableSorting,
  serializeMbqlParam,
} from "../common/utils";

type UseAdHocTableQueryProps = {
  tableId: number;
  databaseId: number;
  location: Location<{ filter?: string; sorting?: string }>;
};

export const useAdHocTableQuery = ({
  tableId,
  databaseId,
  location,
}: UseAdHocTableQueryProps) => {
  const filterQueryParam = useMemo(
    () =>
      location.query?.filter
        ? deserializeTableFilter(location.query.filter)
        : null,
    [location.query.filter],
  );

  const sortingQueryParam = useMemo(
    () =>
      location.query?.sorting
        ? deserializeTableSorting(location.query.sorting)
        : null,
    [location.query.sorting],
  );

  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const table = metadata.table(tableId);

  useEffect(() => {
    dispatch(loadMetadataForTable(tableId));
  }, [dispatch, tableId]);

  const tableQuestion = useMemo(() => {
    if (table) {
      let question = Question.create({ databaseId, tableId, metadata });

      if (filterQueryParam || sortingQueryParam) {
        const legacyQuery = Lib.toLegacyQuery(
          question.query(),
        ) as StructuredDatasetQuery;

        if (filterQueryParam) {
          legacyQuery.query.filter = filterQueryParam;
        }

        if (sortingQueryParam) {
          legacyQuery.query["order-by"] = sortingQueryParam;
        }

        question = question.setDatasetQuery(legacyQuery);
      }

      return question;
    }
  }, [
    table,
    databaseId,
    tableId,
    metadata,
    filterQueryParam,
    sortingQueryParam,
  ]);

  const handleTableQuestionChange = useCallback(
    (newQuestion: Question) => {
      const legacyQuery = Lib.toLegacyQuery(
        newQuestion.query(),
      ) as StructuredDatasetQuery;
      const newFilterMbql = legacyQuery.query.filter;
      const newSortingMbql = legacyQuery.query["order-by"];

      if (newFilterMbql || newSortingMbql) {
        const searchParams = new URLSearchParams();
        if (newFilterMbql) {
          searchParams.append("filter", serializeMbqlParam(newFilterMbql));
        }
        if (newSortingMbql) {
          searchParams.append("sorting", serializeMbqlParam(newSortingMbql));
        }

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

  const tableQuery = useMemo(() => {
    if (tableQuestion) {
      return Lib.toLegacyQuery(tableQuestion.query());
    }
  }, [tableQuestion]);

  return {
    tableQuestion,
    tableQuery,
    handleTableQuestionChange,
  };
};
