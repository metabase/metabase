import { useEffect, useState } from "react";
import { t } from "ttag";

import { PaginationFooter } from "metabase/data-grid";
import Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import S from "./ObjectDetail.module.css";
import { ObjectDetailPanel } from "./ObjectDetailPanel";
import type { ObjectDetailProps } from "./types";

function getItemMessage(index: number, total: number) {
  return total >= HARD_ROW_LIMIT
    ? t`Item ${index + 1} of first ${total}`
    : t`Item ${index + 1} of ${total}`;
}

export function ObjectDetail({
  question,
  isDataApp,
  data,
  closeObjectDetail,
  card,
  dashcard,
  onActionSuccess,
  ...rest
}: ObjectDetailProps) {
  const [currentObjectIndex, setCurrentObjectIndex] = useState(0);

  useEffect(() => {
    if (data.rows.length <= currentObjectIndex) {
      setCurrentObjectIndex(0);
    }
  }, [data.rows, currentObjectIndex]);

  const hasPagination = data?.rows?.length > 1;
  const resolvedQuestion =
    question ??
    (card && rest.metadata ? new Question(card, rest.metadata) : undefined);

  return (
    <>
      <ObjectDetailPanel
        {...rest}
        zoomedRow={data.rows[currentObjectIndex]}
        data={data}
        question={resolvedQuestion}
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
          message={getItemMessage(currentObjectIndex, data.rows.length)}
          onNextPage={() => setCurrentObjectIndex((prev) => prev + 1)}
          onPreviousPage={() => setCurrentObjectIndex((prev) => prev - 1)}
        />
      )}
    </>
  );
}
