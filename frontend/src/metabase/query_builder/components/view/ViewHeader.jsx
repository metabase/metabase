import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import ButtonBar from "metabase/components/ButtonBar";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import Link from "metabase/components/Link";
import ViewButton from "metabase/query_builder/components/view/ViewButton";

import { usePrevious } from "metabase/hooks/use-previous";
import { useToggle } from "metabase/hooks/use-toggle";

import SavedQuestionHeaderButton from "metabase/query_builder/components/SavedQuestionHeaderButton/SavedQuestionHeaderButton";

import RunButtonWithTooltip from "../RunButtonWithTooltip";

import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionLineage from "./QuestionLineage";
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import QuestionNotebookButton from "./QuestionNotebookButton";
import QuestionFilters, { QuestionFilterWidget } from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";
import NativeQueryButton from "./NativeQueryButton";
import ViewSection from "./ViewSection";
import {
  AdHocViewHeading,
  SaveButton,
  SavedQuestionHeaderButtonContainer,
  ViewHeaderMainLeftContentContainer,
  ViewHeaderLeftSubHeading,
  ViewHeaderContainer,
  ViewSQLButtonContainer,
} from "./ViewHeader.styled";

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
  isShowingFilterSidebar: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,

  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,

  onOpenModal: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  onAddFilter: PropTypes.func,
  onCloseFilter: PropTypes.func,
  onOpenQuestionDetails: PropTypes.func,
  onCloseQuestionDetails: PropTypes.func,
  onOpenQuestionHistory: PropTypes.func,

  isPreviewable: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  setIsPreviewing: PropTypes.func,

  className: PropTypes.string,
  style: PropTypes.object,
};

export function ViewTitleHeader(props) {
  const { question, className, style } = props;

  const [
    areFiltersExpanded,
    { turnOn: expandFilters, turnOff: collapseFilters },
  ] = useToggle(!question?.isSaved());

  const previousQuestion = usePrevious(question);

  useEffect(() => {
    if (!question.isStructured() || !previousQuestion?.isStructured()) {
      return;
    }

    const filtersCount = question.query().filters().length;
    const previousFiltersCount = previousQuestion.query().filters().length;

    if (filtersCount > previousFiltersCount) {
      expandFilters();
    }
  }, [previousQuestion, question, expandFilters]);

  const lastEditInfo = question.lastEditInfo();

  const isStructured = question.isStructured();
  const isNative = question.isNative();
  const isSaved = question.isSaved();
  const isDataset = question.isDataset();

  const isSummarized =
    isStructured &&
    question
      .query()
      .topLevelQuery()
      .hasAggregations();

  const showFiltersInHeading = !isSummarized && !areFiltersExpanded;

  return (
    <ViewHeaderContainer className={className} style={style}>
      {isSaved ? (
        <SavedQuestionLeftSide
          {...props}
          lastEditInfo={lastEditInfo}
          areFiltersExpanded={areFiltersExpanded}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
        />
      ) : (
        <AhHocQuestionLeftSide
          {...props}
          isNative={isNative}
          isSummarized={isSummarized}
          areFiltersExpanded={areFiltersExpanded}
          showFiltersInHeading={showFiltersInHeading}
          onExpandFilters={expandFilters}
          onCollapseFilters={collapseFilters}
        />
      )}
      <ViewTitleHeaderRightSide
        {...props}
        isSaved={isSaved}
        isDataset={isDataset}
        isNative={isNative}
        isSummarized={isSummarized}
      />
    </ViewHeaderContainer>
  );
}

SavedQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  lastEditInfo: PropTypes.object,
  areFiltersExpanded: PropTypes.bool.isRequired,
  isShowingQuestionDetailsSidebar: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  onExpandFilters: PropTypes.func.isRequired,
  onCollapseFilters: PropTypes.func.isRequired,
  onOpenQuestionDetails: PropTypes.func.isRequired,
  onCloseQuestionDetails: PropTypes.func.isRequired,
  onOpenQuestionHistory: PropTypes.func.isRequired,
};

function SavedQuestionLeftSide(props) {
  const {
    question,
    areFiltersExpanded,
    isObjectDetail,
    isShowingQuestionDetailsSidebar,
    onExpandFilters,
    onCollapseFilters,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
    lastEditInfo,
    onOpenQuestionHistory,
  } = props;
  return (
    <div>
      <ViewHeaderMainLeftContentContainer>
        <SavedQuestionHeaderButtonContainer>
          <SavedQuestionHeaderButton
            question={question}
            isActive={isShowingQuestionDetailsSidebar}
            onClick={
              isShowingQuestionDetailsSidebar
                ? onCloseQuestionDetails
                : onOpenQuestionDetails
            }
          />
        </SavedQuestionHeaderButtonContainer>
        {lastEditInfo && (
          <LastEditInfoLabel
            className="ml1 text-light"
            item={question.card()}
            onClick={onOpenQuestionHistory}
          />
        )}
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        <CollectionBadge
          collectionId={question.collectionId()}
          className="mb1"
        />
        {QuestionDataSource.shouldRender(props) && (
          <QuestionDataSource
            className="ml3 mb1 pr2"
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
          />
        )}
        {QuestionFilters.shouldRender(props) && (
          <QuestionFilters
            className="mb1"
            question={question}
            expanded={areFiltersExpanded}
            onExpand={onExpandFilters}
            onCollapse={onCollapseFilters}
          />
        )}
      </ViewHeaderLeftSubHeading>
    </div>
  );
}

AhHocQuestionLeftSide.propTypes = {
  question: PropTypes.object.isRequired,
  originalQuestion: PropTypes.object,
  isNative: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
  isSummarized: PropTypes.bool,
  areFiltersExpanded: PropTypes.bool,
  showFiltersInHeading: PropTypes.bool,
  onExpandFilters: PropTypes.func.isRequired,
  onCollapseFilters: PropTypes.func.isRequired,
};

function AhHocQuestionLeftSide(props) {
  const {
    question,
    originalQuestion,
    isNative,
    isObjectDetail,
    isSummarized,
    areFiltersExpanded,
    showFiltersInHeading,
    onExpandFilters,
    onCollapseFilters,
  } = props;
  return (
    <div>
      <ViewHeaderMainLeftContentContainer>
        <AdHocViewHeading>
          {isNative ? (
            t`New question`
          ) : (
            <QuestionDescription
              question={question}
              isObjectDetail={isObjectDetail}
            />
          )}
        </AdHocViewHeading>
        {showFiltersInHeading && QuestionFilters.shouldRender(props) && (
          <QuestionFilters
            className="mr2"
            question={question}
            expanded={areFiltersExpanded}
            onExpand={onExpandFilters}
            onCollapse={onCollapseFilters}
          />
        )}
        {QuestionLineage.shouldRender(props) && (
          <QuestionLineage
            question={question}
            originalQuestion={originalQuestion}
          />
        )}
      </ViewHeaderMainLeftContentContainer>
      <ViewHeaderLeftSubHeading>
        {isSummarized && (
          <QuestionDataSource
            className="mb1"
            question={question}
            isObjectDetail={isObjectDetail}
            subHead
            data-metabase-event={`Question Data Source Click`}
          />
        )}
        {!showFiltersInHeading && QuestionFilters.shouldRender(props) && (
          <QuestionFilters
            className={cx("mb1", { ml2: isSummarized })}
            question={question}
            expanded={areFiltersExpanded}
            onExpand={onExpandFilters}
            onCollapse={onCollapseFilters}
          />
        )}
      </ViewHeaderLeftSubHeading>
    </div>
  );
}

ViewTitleHeaderRightSide.propTypes = {
  question: PropTypes.object.isRequired,
  result: PropTypes.object,
  queryBuilderMode: PropTypes.oneOf(["view", "notebook"]),
  isDataset: PropTypes.bool,
  isSaved: PropTypes.bool,
  isNative: PropTypes.bool,
  isRunnable: PropTypes.bool,
  isRunning: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  isNativeEditorOpen: PropTypes.bool,
  isShowingFilterSidebar: PropTypes.bool,
  isShowingSummarySidebar: PropTypes.bool,
  isDirty: PropTypes.bool,
  isResultDirty: PropTypes.bool,
  runQuestionQuery: PropTypes.func,
  cancelQuery: PropTypes.func,
  onOpenModal: PropTypes.func,
  onAddFilter: PropTypes.func,
  onCloseFilter: PropTypes.func,
  onEditSummary: PropTypes.func,
  onCloseSummary: PropTypes.func,
  setQueryBuilderMode: PropTypes.func,
};

function ViewTitleHeaderRightSide(props) {
  const {
    question,
    result,
    queryBuilderMode,
    isSaved,
    isDataset,
    isNative,
    isRunnable,
    isRunning,
    isPreviewing,
    isNativeEditorOpen,
    isShowingFilterSidebar,
    isShowingSummarySidebar,
    isDirty,
    isResultDirty,
    runQuestionQuery,
    cancelQuery,
    onOpenModal,
    onAddFilter,
    onCloseFilter,
    onEditSummary,
    onCloseSummary,
    setQueryBuilderMode,
  } = props;
  const isShowingNotebook = queryBuilderMode === "notebook";

  return (
    <div className="ml-auto flex align-center">
      {!!isDirty && !isDataset && (
        <SaveButton
          disabled={!question.canRun()}
          data-metabase-event={
            isShowingNotebook
              ? `Notebook Mode; Click Save`
              : `View Mode; Click Save`
          }
          onClick={() => onOpenModal("save")}
        >
          {t`Save`}
        </SaveButton>
      )}
      {QuestionFilterWidget.shouldRender(props) && (
        <QuestionFilterWidget
          className="hide sm-show"
          ml={1}
          isShowingFilterSidebar={isShowingFilterSidebar}
          onAddFilter={onAddFilter}
          onCloseFilter={onCloseFilter}
          data-metabase-event={`View Mode; Open Filter Widget`}
        />
      )}
      {QuestionSummarizeWidget.shouldRender(props) && (
        <QuestionSummarizeWidget
          className="hide sm-show"
          ml={1}
          isShowingSummarySidebar={isShowingSummarySidebar}
          onEditSummary={onEditSummary}
          onCloseSummary={onCloseSummary}
          data-metabase-event={`View Mode; Open Summary Widget`}
        />
      )}
      {QuestionNotebookButton.shouldRender({ question }) && (
        <QuestionNotebookButton
          className="hide sm-show"
          ml={2}
          question={question}
          isShowingNotebook={isShowingNotebook}
          setQueryBuilderMode={setQueryBuilderMode}
          data-metabase-event={
            isShowingNotebook
              ? `Notebook Mode;Go to View Mode`
              : `View Mode; Go to Notebook Mode`
          }
        />
      )}
      {NativeQueryButton.shouldRender(props) && (
        <ViewSQLButtonContainer>
          <NativeQueryButton
            size={16}
            question={question}
            data-metabase-event={`Notebook Mode; Convert to SQL Click`}
          />
        </ViewSQLButtonContainer>
      )}
      {isNative && isSaved && <ExploreResultsLink question={question} />}
      {isRunnable && !isNativeEditorOpen && (
        <RunButtonWithTooltip
          className={cx("text-brand-hover hide", {
            "sm-show": !isShowingNotebook || isNative,
            "text-white-hover": isResultDirty,
          })}
          medium
          borderless
          ml={1}
          compact
          result={result}
          isRunning={isRunning}
          isDirty={isResultDirty}
          isPreviewing={isPreviewing}
          onRun={() => runQuestionQuery({ ignoreCache: true })}
          onCancel={cancelQuery}
        />
      )}
    </div>
  );
}

ExploreResultsLink.propTypes = {
  question: PropTypes.object.isRequired,
};

function ExploreResultsLink({ question }) {
  const url = question
    .composeThisQuery()
    .setDisplay("table")
    .setSettings({})
    .getUrl();

  return (
    <Link to={url}>
      <ViewButton medium p={[2, 1]} icon="insight" labelBreakpoint="sm">
        {t`Explore results`}
      </ViewButton>
    </Link>
  );
}

ViewTitleHeader.propTypes = viewTitleHeaderPropTypes;

const viewSubHeaderPropTypes = {
  isPreviewable: PropTypes.bool,
  isPreviewing: PropTypes.bool,
  setIsPreviewing: PropTypes.func,
};

export class ViewSubHeader extends React.Component {
  render() {
    const { isPreviewable, isPreviewing, setIsPreviewing } = this.props;

    const middle = [];
    const left = [];
    const right = [];

    if (isPreviewable) {
      right.push(
        <QuestionPreviewToggle
          key="preview"
          className="ml2"
          isPreviewing={isPreviewing}
          setIsPreviewing={setIsPreviewing}
        />,
      );
    }

    return left.length > 0 || middle.length > 0 || right.length > 0 ? (
      <ViewSection pt={1}>
        <ButtonBar
          className="flex-full"
          left={left}
          center={middle}
          right={right}
        />
      </ViewSection>
    ) : null;
  }
}

ViewSubHeader.propTypes = viewSubHeaderPropTypes;
