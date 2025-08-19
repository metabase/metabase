import { useState } from "react";

import { skipToken, useListTableForeignKeysQuery } from "metabase/api";
import { DetailViewSidesheet } from "metabase/detail-view/components";
import Question from "metabase-lib/v1/Question";
import type { Table } from "metabase-types/api";

import { PaginationFooter } from "../PaginationFooter/PaginationFooter";

import { ObjectDetailView } from "./ObjectDetailView";
import S from "./ObjectDetailWrapper.module.css";
import type { ObjectDetailProps } from "./types";

export function ObjectDetailWrapper({
  question,
  isDataApp,
  data,
  closeObjectDetail,
  card,
  dashcard,
  isObjectDetail,
  ...rest
}: ObjectDetailProps) {
  const [currentObjectIndex, setCurrentObjectIndex] = useState(0);

  // only show modal if this object detail was triggered via an object detail zoom action
  const shouldShowModal = isObjectDetail;
  const getFallbackQuestion = () =>
    card && rest.metadata ? new Question(card, rest.metadata) : undefined;

  const { data: tableForeignKeys } = useListTableForeignKeysQuery(
    shouldShowModal && rest.table ? rest.table.id : skipToken,
  );

  if (shouldShowModal) {
    const {
      canZoomNextRow,
      canZoomPreviousRow,
      series,
      table: tableWrapper,
      viewNextObjectDetail,
      viewPreviousObjectDetail,
      zoomedRow,
      zoomedRowID,
    } = rest;
    const table = tableWrapper?.getPlainObject();
    const columns = series[0]?.data?.results_metadata?.columns;

    if (
      columns != null &&
      table != null &&
      zoomedRow != null &&
      zoomedRowID != null &&
      question
    ) {
      return (
        <DetailViewSidesheet
          columns={columns}
          row={zoomedRow}
          rowId={zoomedRowID}
          table={table}
          tableForeignKeys={tableForeignKeys}
          url={getRowUrl(question, table, zoomedRowID)}
          onClose={closeObjectDetail}
          onNextClick={canZoomNextRow ? viewNextObjectDetail : undefined}
          onPreviousClick={
            canZoomPreviousRow ? viewPreviousObjectDetail : undefined
          }
        />
      );
    }
  }

  const hasPagination = data?.rows?.length > 1;

  return (
    <>
      <ObjectDetailView
        {...rest}
        zoomedRow={data.rows[currentObjectIndex]}
        data={data}
        question={question ?? getFallbackQuestion()}
        showHeader={rest.settings["detail.showHeader"]}
        showControls={false}
        showRelations={false}
        closeObjectDetail={closeObjectDetail}
        isDataApp={isDataApp}
      />
      {hasPagination && (
        <PaginationFooter
          className={S.pagination}
          data-testid="pagination-footer"
          start={currentObjectIndex}
          end={currentObjectIndex}
          total={data.rows.length}
          onNextPage={() => setCurrentObjectIndex((prev) => prev + 1)}
          onPreviousPage={() => setCurrentObjectIndex((prev) => prev - 1)}
          singleItem
        />
      )}
    </>
  );
}

function getRowUrl(
  question: Question,
  table: Table,
  rowId: string | number,
): string | undefined {
  if (typeof table.id === "number") {
    return `/table/${table.id}/detail/${rowId}`;
  }

  if (table.type === "model") {
    return `/model/${question.slug()}/detail/${rowId}`;
  }

  return undefined;
}
