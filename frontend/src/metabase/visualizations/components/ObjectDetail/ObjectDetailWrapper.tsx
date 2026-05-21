import { useEffect, useState } from "react";

import Question from "metabase-lib/v1/Question";

import { PaginationFooter } from "../PaginationFooter/PaginationFooter";

import { ObjectDetailView } from "./ObjectDetailView";
import S from "./ObjectDetailWrapper.module.css";
import type { ObjectDetailProps } from "./types";

/**
 * Static, single-object presentation used by the registered "object"
 * visualization (dashboards, public/embedded, and the QB's main result area).
 * The interactive zoom modal is rendered separately by the query builder
 * (`query_builder/.../ObjectDetailModal`), so this component has no zoom or
 * query-builder wiring.
 */
export function ObjectDetailWrapper({
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

  const getFallbackQuestion = () =>
    card && rest.metadata ? new Question(card, rest.metadata) : undefined;

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
