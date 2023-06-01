import { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { chain } from "icepick";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import PaginationControls from "metabase/components/PaginationControls";

import { getMetadata } from "metabase/selectors/metadata";
import { usePagination } from "metabase/hooks/use-pagination";
import Question from "metabase-lib/Question";

import { AuditMode } from "../lib/mode";
import QuestionLoadAndDisplay from "./QuestionLoadAndDisplay";
import "./AuditTableVisualization";
import { PaginationControlsContainer } from "./AuditTable.styled";

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

const DEFAULT_PAGE_SIZE = 100;

AuditTable.propTypes = {
  metadata: PropTypes.object.isRequired,
  table: PropTypes.object.isRequired,
  pageSize: PropTypes.number.isRequired,
  reload: PropTypes.bool,
  children: PropTypes.node,
  dispatch: PropTypes.func.isRequired,
  onLoad: PropTypes.func,
  mode: PropTypes.shape({
    name: PropTypes.string.isRequired,
    drills: PropTypes.func.isRequired,
  }),
};

function AuditTable({
  metadata,
  table,
  pageSize = DEFAULT_PAGE_SIZE,
  mode = AuditMode,
  children,
  dispatch,
  onLoad,
  ...rest
}) {
  const [loadedCount, setLoadedCount] = useState(0);
  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const handleOnLoad = results => {
    setLoadedCount(results[0].row_count);
    onLoad(results);
  };

  const card = chain(table.card)
    .assoc("display", "audit-table")
    .assocIn(["dataset_query", "limit"], pageSize)
    .assocIn(["dataset_query", "offset"], pageSize * page)
    .value();

  const question = new Question(card, metadata);
  const shouldShowPagination = page > 0 || loadedCount === pageSize;
  const handleChangeLocation = url => dispatch(push(url));

  return (
    <div>
      <QuestionLoadAndDisplay
        keepPreviousWhileLoading
        className="mt3"
        question={question}
        metadata={metadata}
        mode={mode}
        onChangeLocation={handleChangeLocation}
        onChangeCardAndRun={() => {}}
        onLoad={handleOnLoad}
        dispatch={dispatch}
        {...rest}
      />
      <PaginationControlsContainer>
        {shouldShowPagination && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            itemsLength={loadedCount}
            onNextPage={loadedCount === pageSize ? handleNextPage : null}
            onPreviousPage={handlePreviousPage}
          />
        )}
      </PaginationControlsContainer>
      {children}
    </div>
  );
}

export default _.compose(connect(mapStateToProps))(AuditTable);
