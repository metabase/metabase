import React from "react";

import { t } from "ttag";

import Button from "metabase/components/Button";

import Icon from "metabase/components/Icon";
import CollectionBadge from "metabase/questions/components/CollectionBadge";

import ViewSection, { ViewHeading, ViewSubHeading } from "./ViewSection";

import QuestionFilters, { questionHasFilters } from "./QuestionFilters";
import QuestionSummaries from "./QuestionSummaries";

import QuestionDataSource from "./QuestionDataSource";
import QuestionDescription from "./QuestionDescription";
import QuestionEntityMenu from "./QuestionEntityMenu";
import QuestionLineage from "./QuestionLineage";
import QuestionRowCount from "./QuestionRowCount";
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import QuestionAlertWidget from "./QuestionAlertWidget";
import NativeQueryButton from "./NativeQueryButton";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";

export const ViewTitleHeader = ({
  className,
  style,
  question,
  onOpenModal,
  originalQuestion,
  isDirty,
  isNew,
  queryBuilderMode,
  setQueryBuilderMode,
}) => {
  const isShowingNotebook = queryBuilderMode === "notebook";
  const description = question.description();

  return (
    <ViewSection className={className} style={style}>
      {question.isSaved() ? (
        <div>
          <div className="flex align-center">
            <ViewHeading className="mr1">{question.displayName()}</ViewHeading>
            {description && (
              <Icon
                name="info"
                className="text-light mx1"
                size={18}
                tooltip={description}
              />
            )}
            <QuestionEntityMenu question={question} onOpenModal={onOpenModal} />
          </div>
          <ViewSubHeading className="flex align-center">
            <CollectionBadge collectionId={question.collectionId()} />
            <span className="mx2 text-light text-smaller">•</span>
            <QuestionDataSource question={question} subHead />
          </ViewSubHeading>
        </div>
      ) : (
        <div>
          <ViewHeading>
            {question.isNative() ? (
              t`New question`
            ) : (
              <QuestionDescription question={question} />
            )}
          </ViewHeading>
          {question.isStructured() &&
            question.query().aggregations().length > 0 && (
              <div className="pt1">
                <QuestionDataSource question={question} subHead />
              </div>
            )}
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
        {!question.isNative() &&
          isShowingNotebook &&
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
        {!question.isNative() && (
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
      </div>
    </ViewSection>
  );
};

export class ViewSubHeader extends React.Component {
  state = {
    isFiltersExpanded: false,
  };

  expandFilters = () => this.setState({ isFiltersExpanded: true });

  render() {
    const {
      question,
      onOpenModal,
      onOpenAddAggregation,

      result,
      isAdmin,
      isRunnable,
      isRunning,
      isResultDirty,

      isPreviewable,
      isPreviewing,
      setIsPreviewing,

      runQuestionQuery,
      cancelQuery,

      questionAlerts,
      visualizationSettings,

      queryBuilderMode,
    } = this.props;

    const isFiltersExpanded =
      questionHasFilters(question) &&
      (this.state.isFiltersExpanded || !question.isSaved());

    const left = [];
    const middle = [];
    const right = [];

    if (QuestionSummaries.shouldRender({ question, queryBuilderMode })) {
      left.push(
        <QuestionSummaries
          key="summarize"
          className="mr2"
          question={question}
          onOpenAddAggregation={onOpenAddAggregation}
        />,
      );
    }

    if (
      !isFiltersExpanded &&
      QuestionFilters.shouldRender({ question, queryBuilderMode })
    ) {
      left.push(
        <QuestionFilters
          key="filters"
          question={question}
          onOpenAddFilter={this.props.onOpenAddFilter}
          onCloseFilter={this.props.onCloseFilter}
          onExpand={this.expandFilters}
        />,
      );
    }
    if (isRunnable) {
      middle.push(
        <RunButtonWithTooltip
          key="run"
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
    if (QuestionRowCount.shouldRender(this.props) && !isPreviewing) {
      right.push(
        <QuestionRowCount key="row_count" className="mx1" {...this.props} />,
      );
    }
    if (isPreviewable) {
      right.push(
        <QuestionPreviewToggle
          key="preview"
          className="mx2"
          isPreviewing={isPreviewing}
          setIsPreviewing={setIsPreviewing}
        />,
      );
    }
    if (QueryDownloadWidget.shouldRender({ result, isResultDirty })) {
      right.push(
        <QueryDownloadWidget
          key="download"
          className="mx1 hide sm-show"
          card={question.card()}
          result={result}
        />,
      );
    }
    if (QuestionEmbedWidget.shouldRender({ question, isAdmin })) {
      right.push(
        <QuestionEmbedWidget
          key="embed"
          className="mx1 hide sm-show"
          card={question.card()}
        />,
      );
    }
    if (
      QuestionAlertWidget.shouldRender({
        question,
        visualizationSettings,
      })
    ) {
      right.push(
        <QuestionAlertWidget
          key="alerts"
          className="mx1 hide sm-show"
          question={question}
          questionAlerts={questionAlerts}
          onCreateAlert={() =>
            question.isSaved()
              ? onOpenModal("create-alert")
              : onOpenModal("save-question-before-alert")
          }
        />,
      );
    }

    return (
      <div>
        {isFiltersExpanded &&
          QuestionFilters.shouldRender({ question, queryBuilderMode }) && (
            <ViewSection>
              <QuestionFilters
                question={question}
                expanded
                onOpenAddFilter={this.props.onOpenAddFilter}
                onOpenEditFilter={this.props.onOpenEditFilter}
                onCloseFilter={this.props.onCloseFilter}
              />
            </ViewSection>
          )}
        {(left.length > 0 || middle.length > 0 || right.length > 0) && (
          <ViewSection className="flex text-medium text-bold borderless">
            <div className="flex-full flex-basis-none flex align-center">
              {left}
            </div>
            <div>{middle}</div>
            <div className="flex-full flex-basis-none flex align-center justify-end">
              {right}
            </div>
          </ViewSection>
        )}
      </div>
    );
  }
}
