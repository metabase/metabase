import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

import Icon from "metabase/components/Icon";
import ButtonBar from "metabase/components/ButtonBar";
import CollectionBadge from "metabase/questions/components/CollectionBadge";

import ViewSection, { ViewHeading, ViewSubHeading } from "./ViewSection";

import QuestionFilters, { questionHasFilters } from "./QuestionFilters";
import QuestionSummaries from "./QuestionSummaries";

import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionEntityMenu from "./QuestionEntityMenu";
import QuestionLineage from "./QuestionLineage";
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import NativeQueryButton from "./NativeQueryButton";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";

export class ViewTitleHeader extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isFiltersExpanded: props.question && !props.question.isSaved(),
    };
  }

  expandFilters = () => {
    this.setState({ isFiltersExpanded: true });
  };

  collapseFilters = () => {
    this.setState({ isFiltersExpanded: false });
  };

  render() {
    const {
      className,
      style,
      question,
      onOpenModal,
      originalQuestion,
      isDirty,
      isNew,
      queryBuilderMode,
      setQueryBuilderMode,
      result,
      isRunnable,
      isRunning,
      isResultDirty,
      isPreviewing,
      runQuestionQuery,
      cancelQuery,
      onOpenAddAggregation,
    } = this.props;
    const isShowingNotebook = queryBuilderMode === "notebook";
    const description = question.description();

    const isStructured = question.isStructured();
    const isNative = question.isNative();
    const isSaved = question.isSaved();
    const isSummarized = isStructured && question.query().hasAggregations();

    const isFiltersVisible = QuestionFilters.shouldRender({
      question,
      queryBuilderMode,
    });
    const isFiltersExpanded =
      isFiltersVisible &&
      question.query().hasFilters() &&
      this.state.isFiltersExpanded;

    const showFiltersInHeading = !isSummarized && !isFiltersExpanded;

    return (
      <ViewSection
        className={cx("border-bottom", className)}
        style={style}
        py={[1]}
      >
        {isSaved ? (
          <div>
            <div className="flex align-center">
              <ViewHeading className="my1 mr1">
                {question.displayName()}
              </ViewHeading>
              {description && (
                <Icon
                  name="info"
                  className="text-light mx1"
                  size={18}
                  tooltip={description}
                />
              )}
              <QuestionEntityMenu
                question={question}
                onOpenModal={onOpenModal}
              />
            </div>
            <ViewSubHeading className="flex align-center">
              <CollectionBadge collectionId={question.collectionId()} />
              <span className="mx2 text-light text-smaller">•</span>
              <QuestionDataSource question={question} subHead />
              {isFiltersVisible && (
                <QuestionFilters
                  question={question}
                  expanded={isFiltersExpanded}
                  onExpand={this.expandFilters}
                  onCollapse={this.collapseFilters}
                />
              )}
            </ViewSubHeading>
          </div>
        ) : (
          <div>
            <div className="flex align-center">
              <ViewHeading className="my1">
                {isNative ? (
                  t`New question`
                ) : (
                  <QuestionDescription question={question} />
                )}
              </ViewHeading>
              {isFiltersVisible && showFiltersInHeading && (
                <QuestionFilters
                  question={question}
                  expanded={isFiltersExpanded}
                  onExpand={this.expandFilters}
                  onCollapse={this.collapseFilters}
                />
              )}
            </div>
            <div className="flex align-center">
              {isSummarized && (
                <QuestionDataSource question={question} subHead />
              )}
              {isFiltersVisible && !showFiltersInHeading && (
                <QuestionFilters
                  question={question}
                  expanded={isFiltersExpanded}
                  onExpand={this.expandFilters}
                  onCollapse={this.collapseFilters}
                />
              )}
            </div>
            {QuestionLineage.shouldRender({ question, originalQuestion }) && (
              <div className="mt1">
                <ViewSubHeading>
                  <QuestionLineage
                    question={question}
                    originalQuestion={originalQuestion}
                  />
                </ViewSubHeading>
              </div>
            )}
          </div>
        )}
        <div className="ml-auto flex align-center">
          {isShowingNotebook &&
            question.isStructured() &&
            question.database() &&
            question.database().native_permissions === "write" && (
              <NativeQueryButton size={20} question={question} />
            )}
          {isDirty ? (
            <Button
              medium
              ml={3}
              onClick={() => onOpenModal("save")}
            >{t`Save`}</Button>
          ) : null}
          {!isShowingNotebook &&
            QuestionSummaries.shouldRender({ question, queryBuilderMode }) && (
              <QuestionSummaries
                key="summarize"
                className="ml1"
                question={question}
                onOpenAddAggregation={onOpenAddAggregation}
              />
            )}
          {question.isStructured() && (
            <Button
              icon="list"
              medium
              ml={1}
              primary={isShowingNotebook}
              style={{ minWidth: 115 }}
              onClick={() =>
                setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
              }
            >
              {isShowingNotebook ? t`Hide editor` : t`Show editor`}
            </Button>
          )}
          {!isShowingNotebook && !question.isNative() && isRunnable && (
            <RunButtonWithTooltip
              compact
              className="ml1"
              result={result}
              isRunnable={isRunnable}
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
}

export class ViewSubHeader extends React.Component {
  state = {
    isFiltersExpanded: false,
  };

  expandFilters = () => this.setState({ isFiltersExpanded: true });

  render() {
    const {
      question,

      result,
      isRunnable,
      isRunning,
      isResultDirty,

      isPreviewable,
      isPreviewing,
      setIsPreviewing,

      runQuestionQuery,
      cancelQuery,
    } = this.props;

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
    if (isRunnable && question.isNative()) {
      middle.push(
        <RunButtonWithTooltip
          key="run"
          circular
          result={result}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isDirty={isResultDirty}
          isPreviewing={isPreviewing}
          onRun={() => runQuestionQuery({ ignoreCache: true })}
          onCancel={() => cancelQuery()}
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
