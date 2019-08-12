import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Button from "metabase/components/Button";
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

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

export class ViewTitleHeader extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isFiltersExpanded: props.question && !props.question.isSaved(),
    };
  }

  componentWillReceiveProps(nextProps) {
    const query = this.props.question.query();
    const nextQuery = nextProps.question.query();
    const filtersCount =
      query instanceof StructuredQuery ? query.filters().length : 0;
    const nextFiltersCount =
      nextQuery instanceof StructuredQuery ? nextQuery.filters().length : 0;
    if (nextFiltersCount > filtersCount) {
      this.expandFilters();
    }
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
          <div className="mb1">
            <div className="flex align-center">
              <ViewHeading className="mr1">
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
          <div className="mb1">
            <div className="flex align-baseline">
              <ViewHeading className="mt1" style={{ marginBottom: 4 }}>
                {isNative ? (
                  t`New question`
                ) : (
                  <QuestionDescription question={question} />
                )}
              </ViewHeading>
              {showFiltersInHeading &&
                QuestionFilters.shouldRender(this.props) && (
                  <div className="ml2">
                    <QuestionFilters
                      question={question}
                      expanded={isFiltersExpanded}
                      onExpand={this.expandFilters}
                      onCollapse={this.collapseFilters}
                    />
                  </div>
                )}
              {QuestionLineage.shouldRender(this.props) && (
                <ViewSubHeading>
                  <QuestionLineage
                    className="ml2"
                    question={question}
                    originalQuestion={originalQuestion}
                  />
                </ViewSubHeading>
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
          </div>
        )}
        <div className="ml-auto flex align-center">
          {NativeQueryButton.shouldRender(this.props) && (
            <NativeQueryButton size={20} question={question} />
          )}
          {isDirty ? (
            <Link
              className="text-brand text-bold py1 px2 rounded bg-white bg-light-hover"
              onClick={() => onOpenModal("save")}
            >
              {t`Save`}
            </Link>
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
            <Tooltip
              tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor`}
            >
              <Button
                borderless={!isShowingNotebook}
                primary={isShowingNotebook}
                medium
                icon="notebook"
                ml={2}
                onClick={() =>
                  setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
                }
              />
            </Tooltip>
          )}
          {isRunnable && (
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
