import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "./ViewButton";

import Icon from "metabase/components/Icon";
import ButtonBar from "metabase/components/ButtonBar";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import Tooltip from "metabase/components/Tooltip.jsx";

import ViewSection, { ViewHeading, ViewSubHeading } from "./ViewSection";

import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionEntityMenu from "./QuestionEntityMenu";
import QuestionLineage from "./QuestionLineage";
import QuestionPreviewToggle from "./QuestionPreviewToggle";

import QuestionFilters, { QuestionFilterWidget } from "./QuestionFilters";
import { QuestionSummarizeWidget } from "./QuestionSummaries";

import NativeQueryButton from "./NativeQueryButton";
import RunButtonWithTooltip from "../RunButtonWithTooltip";

import colors from "metabase/lib/colors";

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
      queryBuilderMode,
      setQueryBuilderMode,
      result,
      isRunnable,
      isRunning,
      isResultDirty,
      isPreviewing,
      runQuestionQuery,
      cancelQuery,
      isShowingSummarySidebar,
      onEditSummary,
      onCloseSummary,
      isShowingFilterSidebar,
      onAddFilter,
      onCloseFilter,
    } = this.props;
    const { isFiltersExpanded } = this.state;
    const isShowingNotebook = queryBuilderMode === "notebook";
    const description = question.description();

    const isStructured = question.isStructured();
    const isNative = question.isNative();
    const isSaved = question.isSaved();

    const isSummarized =
      isStructured &&
      question
        .query()
        .topLevelQuery()
        .hasAggregations();

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
              {QuestionFilters.shouldRender(this.props) && (
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
              {showFiltersInHeading &&
                QuestionFilters.shouldRender(this.props) && (
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
              {!showFiltersInHeading &&
                QuestionFilters.shouldRender(this.props) && (
                  <QuestionFilters
                    question={question}
                    expanded={isFiltersExpanded}
                    onExpand={this.expandFilters}
                    onCollapse={this.collapseFilters}
                  />
                )}
            </div>
            {QuestionLineage.shouldRender(this.props) && (
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
          {NativeQueryButton.shouldRender(this.props) && (
            <NativeQueryButton size={20} question={question} />
          )}
          {isDirty ? (
            <Button
              medium
              ml={3}
              color={colors["brand"]}
              onClick={() => onOpenModal("save")}
            >{t`Save`}</Button>
          ) : null}
          {QuestionFilterWidget.shouldRender(this.props) && (
            <QuestionFilterWidget
              ml={1}
              query={question.query()}
              isShowingFilterSidebar={isShowingFilterSidebar}
              onAddFilter={onAddFilter}
              onCloseFilter={onCloseFilter}
            />
          )}
          {QuestionSummarizeWidget.shouldRender(this.props) && (
            <QuestionSummarizeWidget
              ml={1}
              question={question}
              isShowingSummarySidebar={isShowingSummarySidebar}
              onEditSummary={onEditSummary}
              onCloseSummary={onCloseSummary}
            />
          )}
          {question.isStructured() && (
            <Tooltip tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor`}>
              <Button
                borderless={!isShowingNotebook}
                primary={isShowingNotebook}
                medium
                ml={1}
                icon="notebook"
                onClick={() =>
                  setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
                }
              />
            </Tooltip>
          )}
          {isRunnable && !isNative && (
            <RunButtonWithTooltip
              className={cx({ hidden: isShowingNotebook })}
              medium
              borderless
              ml={1}
              compact
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
          medium
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
