import PropTypes from "prop-types";
import { useCallback, useEffect } from "react";
import { usePrevious } from "react-use";

import { useToggle } from "metabase/hooks/use-toggle";
import * as Lib from "metabase-lib";

import { ViewHeaderContainer } from "./ViewHeader.styled";
import {
  AdHocQuestionLeftSide,
  FilterHeader,
  SavedQuestionLeftSide,
  ViewTitleHeaderRightSide,
  DashboardBackButton,
} from "./components";

const viewTitleHeaderPropTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,

  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  setQueryBuilderMode: PropTypes.func,

  result: PropTypes.object,

  isDirty: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isNavBarOpen: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,

  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,
  updateQuestion: PropTypes.func,

  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  onOpenQuestionDetails: PropTypes.func,

  isBookmarked: PropTypes.bool,
  isActionListVisible: PropTypes.bool,
  turnDatasetIntoQuestion: PropTypes.func,
  toggleBookmark: PropTypes.func,
  onOpenQuestionInfo: PropTypes.func,
  onCloseQuestionInfo: PropTypes.func,
  isShowingQuestionInfoSidebar: PropTypes.bool,
  onModelPersistenceChange: PropTypes.func,

  className: PropTypes.string,
  style: PropTypes.object,
};

export function ViewTitleHeader(props) {
  const { question, className, style, isNavBarOpen, updateQuestion } = props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  const query = question.query();
  const previousQuery = usePrevious(query);

  useEffect(() => {
    const { isNative } = Lib.queryDisplayInfo(query);
    const isPreviousQuestionNative =
      previousQuery && Lib.queryDisplayInfo(previousQuery).isNative;

    if (isNative || isPreviousQuestionNative) {
      return;
    }

    const filtersCount = Lib.filters(query, -1).length;
    const previousFiltersCount =
      previousQuery && Lib.filters(previousQuery, -1).length;

    if (filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters, previousQuery, query]);

  const { isNative } = Lib.queryDisplayInfo(query);
  const isSaved = question.isSaved();
  const isModelOrMetric =
    question.type() === "model" || question.type() === "metric";
  const isSummarized = Lib.aggregations(query, -1).length > 0;

  const onQueryChange = useCallback(
    newQuery => {
      updateQuestion(newQuery.question(), { run: true });
    },
    [updateQuestion],
  );

  return (
    <>
      <ViewHeaderContainer
        className={className}
        style={style}
        data-testid="qb-header"
        isNavBarOpen={isNavBarOpen}
      >
        <DashboardBackButton />
        {isSaved ? (
          <SavedQuestionLeftSide {...props} />
        ) : (
          <AdHocQuestionLeftSide
            {...props}
            isNative={isNative}
            isSummarized={isSummarized}
          />
        )}
        <ViewTitleHeaderRightSide
          question={question}
          result={props.result}
          queryBuilderMode={props.queryBuilderMode}
          isBookmarked={props.isBookmarked}
          isRunnable={props.isRunnable}
          isRunning={props.isRunning}
          isNativeEditorOpen={props.isNativeEditorOpen}
          isShowingSummarySidebar={props.isShowingSummarySidebar}
          isDirty={props.isDirty}
          isResultDirty={props.isResultDirty}
          isActionListVisible={props.isActionListVisible}
          runQuestionQuery={props.runQuestionQuery}
          cancelQuery={props.cancelQuery}
          onOpenModal={props.onOpenModal}
          onEditSummary={props.onEditSummary}
          onCloseSummary={props.onCloseSummary}
          setQueryBuilderMode={props.setQueryBuilderMode}
          turnDatasetIntoQuestion={props.turnDatasetIntoQuestion}
          toggleBookmark={props.toggleBookmark}
          onOpenQuestionInfo={props.onOpenQuestionInfo}
          onCloseQuestionInfo={props.onCloseQuestionInfo}
          isShowingQuestionInfoSidebar={props.isShowingQuestionInfoSidebar}
          onModelPersistenceChange={props.onModelPersistenceChange}
          isObjectDetail={props.isObjectDetail}
          isSaved={isSaved}
          isModelOrMetric={isModelOrMetric}
          isNative={isNative}
          isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
          onQueryChange={onQueryChange}
        />
      </ViewHeaderContainer>
      {FilterHeader.shouldRender(props) && (
        <FilterHeader
          {...props}
          expanded={areFiltersExpanded}
          question={question}
          onQueryChange={onQueryChange}
        />
      )}
    </>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;
