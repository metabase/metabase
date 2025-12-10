import type { Location } from "history";
import { useCallback, useEffect, useMemo } from "react";
import { push } from "react-router-redux";

import { b64url_to_utf8, utf8_to_b64url } from "metabase/lib/encoding";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { loadMetadataForTable } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { OpaqueDatasetQuery } from "metabase-types/api";

type UseAdHocTableQueryProps = {
  tableId: number;
  databaseId: number;
  location: Location<{ query?: string }>;
};

export const useAdHocTableQuery = ({
  tableId,
  databaseId,
  location,
}: UseAdHocTableQueryProps) => {
  const metadata = useSelector(getMetadata);
  const dispatch = useDispatch();

  const queryParam = useMemo(
    () =>
      location.query?.query
        ? deserializeQueryFromUrl(location.query.query)
        : null,
    [location.query.query],
  );

  const metadataProvider = useMemo(
    () => Lib.metadataProvider(databaseId, metadata),
    [databaseId, metadata],
  );
  const table = useMemo(
    () => Lib.tableOrCardMetadata(metadataProvider, tableId),
    [metadataProvider, tableId],
  );

  useEffect(() => {
    dispatch(loadMetadataForTable(tableId));
  }, [dispatch, tableId]);

  const tableQuestion = useMemo(() => {
    if (queryParam != null) {
      const query = Lib.fromJsQuery(metadataProvider, queryParam);
      if (Lib.sourceTableOrCardId(query) === tableId) {
        return Question.create({
          dataset_query: Lib.toJsQuery(query),
          metadata,
        });
      }
    }

    if (table != null) {
      const query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
      return Question.create({ dataset_query: Lib.toJsQuery(query), metadata });
    }
  }, [tableId, table, queryParam, metadata, metadataProvider]);

  const handleTableQuestionChange = useCallback(
    (newQuestion: Question) => {
      const newQuery = newQuestion.query();
      const newFilters = Lib.filters(newQuery, 0);
      const newOrderBys = Lib.orderBys(newQuery, 0);

      // don't set the query string param if there are no filters or sorting
      if (newFilters.length > 0 || newOrderBys.length > 0) {
        const searchParams = new URLSearchParams();
        searchParams.set("query", serializeQueryToUrl(Lib.toJsQuery(newQuery)));
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
      return Lib.toJsQuery(tableQuestion.query());
    }
  }, [tableQuestion]);

  return {
    tableQuestion,
    tableQuery,
    handleTableQuestionChange,
  };
};

function serializeQueryToUrl(query: OpaqueDatasetQuery) {
  return utf8_to_b64url(JSON.stringify(query));
}

function deserializeQueryFromUrl(query: string): OpaqueDatasetQuery {
  return JSON.parse(b64url_to_utf8(query));
}
