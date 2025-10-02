import { useState } from "react";

import { skipToken, useListTableForeignKeysQuery } from "metabase/api";
import { DetailViewSidesheet } from "metabase/detail-view/components";
import { filterByPk } from "metabase/detail-view/utils.spec";
import Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import { PaginationFooter } from "../PaginationFooter/PaginationFooter";

import { ObjectDetailView } from "./ObjectDetailView";
import S from "./ObjectDetailWrapper.module.css";
import type { ObjectDetailProps } from "./types";
import { getApiTable, getRowUrl } from "./utils";

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

  const areImplicitActionsEnabled = Boolean(
    question &&
      question.canWrite() &&
      question.type() === "model" &&
      question.supportsImplicitActions(),
  );

  if (shouldShowModal) {
    const {
      canZoom,
      canZoomNextRow,
      canZoomPreviousRow,
      settings,
      table: tableWrapper,
      viewNextObjectDetail,
      viewPreviousObjectDetail,
      zoomedRow,
      zoomedRowID,
    } = rest;
    const table = getApiTable(tableWrapper);
    const columns = data?.cols;

    if (columns != null && zoomedRowID != null && question != null) {
      const columnsSettings = columns.map((column) => {
        return settings?.column_settings?.[getColumnKey(column)];
      });

      return (
        <DetailViewSidesheet
          columnSettings={settings?.["table.columns"]}
          columns={columns}
          columnsSettings={columnsSettings}
          query={filterByPk(question.query(), columns, zoomedRowID)}
          row={zoomedRow}
          rowId={zoomedRowID}
          showImplicitActions={areImplicitActionsEnabled}
          showNav={Boolean(canZoom && (canZoomNextRow || canZoomPreviousRow))}
          table={table}
          tableForeignKeys={tableForeignKeys}
          url={getRowUrl(question, columns, table, zoomedRowID)}
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
