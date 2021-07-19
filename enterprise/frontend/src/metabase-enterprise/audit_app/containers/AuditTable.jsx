import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { chain } from "icepick";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import PaginationControls from "metabase/components/PaginationControls";

import Question from "metabase-lib/lib/Question";

import { getMetadata } from "metabase/selectors/metadata";
import { usePagination } from "metabase/hooks/use-pagination";

import { AuditMode } from "../lib/util";
import QuestionLoadAndDisplay from "./QuestionLoadAndDisplay";
import "./AuditTableVisualization";

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

const DEFAULT_PAGE_SIZE = 100;

AuditTable.propTypes = {
  metadata: PropTypes.object.isRequired,
  table: PropTypes.object.isRequired,
  onChangeLocation: PropTypes.func.isRequired,
  pageSize: PropTypes.number.isRequired,
};

function AuditTable({
  metadata,
  table,
  onChangeLocation,
  pageSize = DEFAULT_PAGE_SIZE,
  ...rest
}) {
  const [loadedCount, setLoadedCount] = useState(0);
  const { handleNextPage, handlePreviousPage, page } = usePagination();

  const card = chain(table.card)
    .assoc("display", "audit-table")
    .assocIn(["dataset_query", "limit"], pageSize)
    .assocIn(["dataset_query", "offset"], pageSize * page)
    .value();

  const question = new Question(card, metadata);
  const shouldShowPagination = page > 0 || loadedCount === pageSize;

  return (
    <div>
      <QuestionLoadAndDisplay
        keepPreviousWhileLoading
        className="mt3"
        question={question}
        metadata={metadata}
        mode={AuditMode}
        onChangeLocation={onChangeLocation}
        onChangeCardAndRun={() => {}}
        onLoad={results => setLoadedCount(results[0].row_count)}
        {...rest}
      />
      <div className="mt1 pt2 border-top flex justify-end">
        {shouldShowPagination && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            itemsLength={loadedCount}
            onNextPage={loadedCount === pageSize ? handleNextPage : null}
            onPreviousPage={handlePreviousPage}
          />
        )}
      </div>
    </div>
  );
}

export default _.compose(
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(AuditTable);
