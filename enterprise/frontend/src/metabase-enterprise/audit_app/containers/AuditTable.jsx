import "../components/AuditTableVisualization";

import { chain } from "icepick";
import PropTypes from "prop-types";
import { useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import PaginationControls from "metabase/components/PaginationControls";
import CS from "metabase/css/core/index.css";
import { usePagination } from "metabase/hooks/use-pagination";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

import { AuditMode } from "../lib/mode";

import { PaginationControlsContainer } from "./AuditTable.styled";
import QuestionLoadAndDisplay from "./QuestionLoadAndDisplay";

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
    onLoad?.(results);
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
        className={CS.mt3}
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
