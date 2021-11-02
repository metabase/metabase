import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import { Box } from "grid-styled";

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
import ViewSection, { ViewHeading, ViewSubHeading } from "./ViewSection";
import { SavedQuestionHeaderButtonContainer } from "./ViewHeader.styled";

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
  const {
    className,
    style,
    question,
    onOpenModal,
    originalQuestion,
    isDirty,
    queryBuilderMode,
    setQueryBuilderMode,
    result,
    isRunnable,
    isRunning,
    isResultDirty,
    isPreviewing,
    isNativeEditorOpen,
    runQuestionQuery,
    cancelQuery,
    isShowingSummarySidebar,
    onEditSummary,
    onCloseSummary,
    isShowingFilterSidebar,
    onAddFilter,
    onCloseFilter,
    isShowingQuestionDetailsSidebar,
    onOpenQuestionDetails,
    onCloseQuestionDetails,
    onOpenQuestionHistory,
    isObjectDetail,
  } = props;

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

  const isShowingNotebook = queryBuilderMode === "notebook";
  const lastEditInfo = question.lastEditInfo();

  const isStructured = question.isStructured();
  const isNative = question.isNative();
  const isSaved = question.isSaved();

  const isSummarized =
    isStructured &&
    question
      .query()
      .topLevelQuery()
      .hasAggregations();

  const showFiltersInHeading = !isSummarized && !areFiltersExpanded;

  return (
    <ViewSection
      className={cx("border-bottom", className)}
      style={style}
      py={[1]}
    >
      {isSaved ? (
        <div>
          <div className="flex align-center">
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
          </div>
          <ViewSubHeading className="flex align-center flex-wrap pt1">
            <CollectionBadge
              className="mb1"
              collectionId={question.collectionId()}
            />

            {QuestionDataSource.shouldRender(props) && (
              <QuestionDataSource
                className="ml3 mb1"
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
                onExpand={expandFilters}
                onCollapse={collapseFilters}
              />
            )}
          </ViewSubHeading>
        </div>
      ) : (
        <div>
          <div className="flex align-baseline flex-wrap">
            <ViewHeading className="mt1 mr2 mb1">
              {isNative ? (
                t`New question`
              ) : (
                <QuestionDescription
                  question={question}
                  isObjectDetail={isObjectDetail}
                />
              )}
            </ViewHeading>
            {showFiltersInHeading && QuestionFilters.shouldRender(props) && (
              <QuestionFilters
                className="mr2 mb1"
                question={question}
                expanded={areFiltersExpanded}
                onExpand={expandFilters}
                onCollapse={collapseFilters}
              />
            )}
            {QuestionLineage.shouldRender(props) && (
              <QuestionLineage
                className="mr2 mb1"
                question={question}
                originalQuestion={originalQuestion}
              />
            )}
          </div>
          <div className="flex align-center flex-wrap">
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
                className="mb1"
                question={question}
                expanded={areFiltersExpanded}
                onExpand={expandFilters}
                onCollapse={collapseFilters}
              />
            )}
          </div>
        </div>
      )}
      <div className="ml-auto flex align-center">
        {isDirty ? (
          <Link
            disabled={!question.canRun()}
            className="text-brand text-bold py1 px2 rounded bg-white bg-light-hover"
            data-metabase-event={
              isShowingNotebook
                ? `Notebook Mode; Click Save`
                : `View Mode; Click Save`
            }
            onClick={() => onOpenModal("save")}
          >
            {t`Save`}
          </Link>
        ) : null}
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
          <Box
            ml={2}
            p={1}
            className="text-medium text-brand-hover cursor-pointer"
          >
            <NativeQueryButton
              size={16}
              question={question}
              data-metabase-event={`Notebook Mode; Convert to SQL Click`}
            />
          </Box>
        )}
        {question.query().database() && isNative && isSaved && (
          <Link
            to={question
              .composeThisQuery()
              .setDisplay("table")
              .setSettings({})
              .getUrl()}
          >
            <ViewButton medium p={[2, 1]} icon="insight" labelBreakpoint="sm">
              {t`Explore results`}
            </ViewButton>
          </Link>
        )}
        {isRunnable && !isNativeEditorOpen && (
          <RunButtonWithTooltip
            className={cx("text-brand-hover hide", {
              "sm-show": !isShowingNotebook || isNative,
              "text-white-hover": isResultDirty && isRunnable,
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
            onCancel={() => cancelQuery()}
          />
        )}
      </div>
    </ViewSection>
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
