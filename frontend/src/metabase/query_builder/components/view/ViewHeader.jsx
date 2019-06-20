import React from "react";
import { t } from "ttag";
import cx from "classnames";

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
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import NativeQueryButton from "./NativeQueryButton";

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
    <ViewSection
      className={cx("border-bottom", className)}
      style={style}
      py={[1]}
    >
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
              <QuestionDataSource question={question} subHead />
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
      onOpenAddAggregation,

      result,
      isRunnable,
      isRunning,
      isResultDirty,

      isPreviewable,
      isPreviewing,
      setIsPreviewing,

      runQuestionQuery,
      cancelQuery,

      queryBuilderMode,
    } = this.props;

    const isFiltersExpanded =
      questionHasFilters(question) &&
      (this.state.isFiltersExpanded || !question.isSaved());

    const middle = [];
    const left = [];
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
    if (isRunnable) {
      const runButton = (
        <RunButtonWithTooltip
          key="run"
          result={result}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isDirty={isResultDirty}
          isPreviewing={isPreviewing}
          onRun={() => runQuestionQuery({ ignoreCache: true })}
          onCancel={() => cancelQuery()}
        />
      );
      if (question.isNative()) {
        middle.push(runButton);
      } else {
        right.push(runButton);
      }
    }

    if (QuestionFilters.shouldRender({ question, queryBuilderMode })) {
      left.push(
        <QuestionFilters
          question={question}
          expanded
          onOpenAddFilter={this.props.onOpenAddFilter}
          onOpenEditFilter={this.props.onOpenEditFilter}
          onCloseFilter={this.props.onCloseFilter}
        />,
      );
    }

    return (
      <div>
        {(left.length > 0 || (middle.length > 0 && right.length > 0)) && (
          <ViewSection pt={1}>
            <div className="mr-auto flex align-center">{left}</div>
            {middle}
            <div className="ml-auto flex align-center">{right}</div>
          </ViewSection>
        )}
      </div>
    );
  }
}
