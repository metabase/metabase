import { useState } from "react";
import type { ObjectDetailProps } from "metabase/visualizations/components/ObjectDetail/types";
import {
  PaginationFooter,
  RootModal,
} from "metabase/visualizations/components/ObjectDetail/ObjectDetail.styled";
import { ObjectDetailView } from "metabase/visualizations/components/ObjectDetail/ObjectDetail";

export function ObjectDetailWrapper({
  question,
  isDataApp,
  data,
  closeObjectDetail,
  card,
  dashcard,
  isObjectDetail,
  ...props
}: ObjectDetailProps) {
  const [currentObjectIndex, setCurrentObjectIndex] = useState(0);

  // only show modal if this object detail was triggered via an object detail zoom action
  const shouldShowModal = isObjectDetail;

  if (shouldShowModal) {
    return (
      <RootModal
        isOpen
        full={false}
        onClose={closeObjectDetail}
        className={""} // need an empty className to override the Modal default width
      >
        <ObjectDetailView
          {...props}
          showHeader
          data={data}
          question={question}
          closeObjectDetail={closeObjectDetail}
        />
      </RootModal>
    );
  }

  const hasPagination = data?.rows?.length > 1;

  return (
    <>
      <ObjectDetailView
        {...props}
        zoomedRow={data.rows[currentObjectIndex]}
        data={data}
        question={question}
        showHeader={props.settings["detail.showHeader"]}
        showControls={false}
        showRelations={false}
        closeObjectDetail={closeObjectDetail}
        isDataApp={isDataApp}
      />
      {hasPagination && (
        <PaginationFooter
          data-testid="pagination-footer"
          start={currentObjectIndex}
          end={currentObjectIndex}
          total={data.rows.length}
          onNextPage={() => setCurrentObjectIndex(prev => prev + 1)}
          onPreviousPage={() => setCurrentObjectIndex(prev => prev - 1)}
          singleItem
        />
      )}
    </>
  );
}
