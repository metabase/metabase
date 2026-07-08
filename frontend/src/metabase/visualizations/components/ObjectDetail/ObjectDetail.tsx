import { useEffect, useState } from "react";

import Question from "metabase-lib/v1/Question";

import { PaginationFooter } from "../PaginationFooter/PaginationFooter";

import S from "./ObjectDetail.module.css";
import { ObjectDetailPanel } from "./ObjectDetailPanel";
import type { ObjectDetailProps } from "./types";

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
          onNextPage={() => setCurrentObjectIndex((prev) => prev + 1)}
          onPreviousPage={() => setCurrentObjectIndex((prev) => prev - 1)}
          singleItem
        />
      )}
    </>
  );
}
