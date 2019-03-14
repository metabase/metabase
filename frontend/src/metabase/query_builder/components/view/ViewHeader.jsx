import React from "react";

import { t } from "c-3po";

import Button from "metabase/components/Button";

import ViewSection, { ViewHeading, ViewSubHeading } from "./ViewSection";

import CollectionBadge from "metabase/questions/components/CollectionBadge";

import QuestionFilters, { questionHasFilters } from "./QuestionFilters";

import QuestionDataSource from "./QuestionDataSource";
import QuestionEntityMenu from "./QuestionEntityMenu";
import QuestionLineage from "./QuestionLineage";
import QuestionRowCount from "./QuestionRowCount";
import QuestionPreviewToggle from "./QuestionPreviewToggle";
import QuestionAlertWidget from "./QuestionAlertWidget";

import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

export const ViewTitleHeader = ({
  className,
  question,
  onOpenModal,
  originalQuestion,
  isDirty,
  isNew,
  queryBuilderMode,
  onSetQueryBuilderMode,
}) => {
  const isNative = question.query() instanceof NativeQuery;
  return (
    <ViewSection className={className}>
      {question.isSaved() ? (
        <div>
          <div className="flex align-center">
            <CollectionBadge
              hasBackground
              collectionId={question.collectionId()}
              className="mr2"
            />
            <ViewHeading>{question.displayName()}</ViewHeading>
            <QuestionEntityMenu
              className="ml1"
              question={question}
              onOpenModal={onOpenModal}
            />
          </div>
          <div className="p1">
            <ViewSubHeading>
              <QuestionDataSource question={question} subHead />
            </ViewSubHeading>
          </div>
        </div>
      ) : (
        <div>
          <ViewHeading>
            {isNative ? (
              t`New question`
            ) : (
              <QuestionDataSource question={question} />
            )}
          </ViewHeading>
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
        {isDirty || isNew ? (
          <Button onClick={() => onOpenModal("save")}>{t`Save`}</Button>
        ) : null}
        {!isNative && (
          <Button
            icon="list"
            borderless
            onClick={() =>
              onSetQueryBuilderMode(
                queryBuilderMode === "worksheet" ? "view" : "worksheet",
              )
            }
          >
            Custom question
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

      result,
      isAdmin,
      isRunnable,
      isRunning,
      isResultDirty,

      isNativeEditorOpen,
      isPreviewable,
      isPreviewing,
      setIsPreviewing,

      runQuestionQuery,
      cancelQuery,

      questionAlerts,
      visualizationSettings,
    } = this.props;

    const isFiltersExpanded =
      this.state.isFiltersExpanded && questionHasFilters(question);

    return (
      <div>
        {isFiltersExpanded &&
          QuestionFilters.shouldRender({ question }) && (
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
        <ViewSection className="flex">
          <div className="flex-full flex-basis-none flex align-center">
            {!isFiltersExpanded &&
              QuestionFilters.shouldRender({ question }) && (
                <QuestionFilters
                  question={question}
                  onOpenAddFilter={this.props.onOpenAddFilter}
                  onCloseFilter={this.props.onCloseFilter}
                  onExpand={this.expandFilters}
                />
              )}
          </div>
          <div>
            <RunButtonWithTooltip
              result={result}
              isRunnable={isRunnable}
              isRunning={isRunning}
              isDirty={isResultDirty}
              isPreviewing={isPreviewing}
              onRun={() => runQuestionQuery({ ignoreCache: true })}
              onCancel={() => cancelQuery()}
            />
          </div>
          <div className="flex-full flex-basis-none flex align-center justify-end text-medium text-bold">
            {QuestionRowCount.shouldRender(this.props) &&
              !isPreviewing && (
                <QuestionRowCount className="mx1" {...this.props} />
              )}
            {isPreviewable && (
              <QuestionPreviewToggle
                className="mx2"
                isPreviewing={isPreviewing}
                setIsPreviewing={setIsPreviewing}
              />
            )}
            {QueryDownloadWidget.shouldRender({ result, isResultDirty }) && (
              <QueryDownloadWidget
                className="mx1 hide sm-show"
                card={question.card()}
                result={result}
              />
            )}
            {QuestionEmbedWidget.shouldRender({ question, isAdmin }) && (
              <QuestionEmbedWidget
                className="mx1 hide sm-show"
                card={question.card()}
              />
            )}
            {QuestionAlertWidget.shouldRender({
              question,
              visualizationSettings,
            }) && (
              <QuestionAlertWidget
                className="mx1 hide sm-show"
                question={question}
                questionAlerts={questionAlerts}
                onCreateAlert={() =>
                  question.isSaved()
                    ? onOpenModal("create-alert")
                    : onOpenModal("save-question-before-alert")
                }
              />
            )}
          </div>
        </ViewSection>
      </div>
    );
  }
}
