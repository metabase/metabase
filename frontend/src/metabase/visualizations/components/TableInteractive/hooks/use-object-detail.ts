import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";

import { createMockMetadata } from "__support__/metadata";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { zoomInRow } from "metabase/query_builder/actions";
import { getRowIndexToPKMap } from "metabase/query_builder/selectors";
import { closeNavbar } from "metabase/redux/app";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { Card, DatasetData, TableId } from "metabase-types/api";

export const useObjectDetail = (
  { rows, cols }: DatasetData,
  card: Card,
  metadata: Metadata | undefined,
) => {
  const dispatch = useDispatch();

  const query = useMemo(() => {
    const metadataProvider = Lib.metadataProvider(
      card.dataset_query.database,
      metadata ?? createMockMetadata(),
    );
    const query = Lib.fromLegacyQuery(
      card.dataset_query.database,
      metadataProvider,
      card.dataset_query,
    );

    return query;
  }, [card.dataset_query, metadata]);

  const rowIndexToPkMap: Record<number, ObjectId> = useSelector((state) =>
    state.qb != null ? getRowIndexToPKMap(state) : {},
  );
  const tableId = useMemo(
    () => getSourceTableId(query, metadata),
    [query, metadata],
  );

  const primaryKeyColumn: ColumnDescriptor | null = useMemo(() => {
    const primaryKeyColumns = cols.filter(
      (column) => column.table_id === tableId && isPK(column),
    );

    if (primaryKeyColumns.length !== 1) {
      return null;
    }
    const primaryKeyColumn = primaryKeyColumns[0];

    return {
      column: primaryKeyColumn,
      index: cols.indexOf(primaryKeyColumn),
    };
  }, [cols, tableId]);

  const onOpenObjectDetail = useCallback(
    (rowIndex: number) => {
      const isRawTable = typeof tableId === "number";
      const isModel = card.type === "model";

      let objectId: number | string;

      if (primaryKeyColumn) {
        const value = rows[rowIndex][primaryKeyColumn.index];
        objectId =
          typeof value === "number" || typeof value === "string"
            ? value
            : rowIndex;
      } else {
        objectId = rowIndexToPkMap?.[rowIndex] ?? rowIndex;
      }

      if (primaryKeyColumn) {
        if (isRawTable) {
          dispatch(closeNavbar());
          dispatch(push(`/table/${tableId}/detail/${objectId}`));
          return;
        }

        if (isModel) {
          dispatch(closeNavbar());
          dispatch(push(`/model/${card.id}/${objectId}`));
          return;
        }
      }

      dispatch(zoomInRow({ objectId }));
    },
    [dispatch, primaryKeyColumn, rowIndexToPkMap, rows, tableId, card],
  );

  return onOpenObjectDetail;
};

function getSourceTableId(
  query: Lib.Query,
  metadata: Metadata | undefined,
): TableId | undefined {
  if (!metadata) {
    return undefined;
  }

  const sourceId = Lib.sourceTableOrCardId(query);

  if (typeof sourceId === "number") {
    return sourceId;
  }

  const questionId = getQuestionIdFromVirtualTableId(sourceId);

  if (!questionId) {
    return undefined;
  }

  const question = metadata.questions[questionId];

  if (!question) {
    return undefined;
  }

  return getSourceTableId(question.query(), metadata);
}
