import React from "react";

import { t } from "c-3po";

import Button from "metabase/components/Button";
import Subhead from "metabase/components/Subhead";
import ViewSection from "./ViewSection";

import CollectionBadge from "metabase/questions/components/CollectionBadge";

import ViewFilters from "./ViewFilters";

import QuestionDataSource from "./QuestionDataSource";
import QuestionEntityMenu from "./QuestionEntityMenu";
import QuestionLineage from "./QuestionLineage";
import QuestionRowCount from "./QuestionRowCount";
import QuestionAlertWidget from "./QuestionAlertWidget";

import RunButtonWithTooltip from "metabase/query_builder/components/RunButtonWithTooltip";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

export default class ViewHeader extends React.Component {
  state = {
    isFiltersExpanded: false,
  };

  addFilter = () => alert("NYI add");
  editFilter = index => alert("NYI edit");
  removeFilter = index => alert("NYI remove");
  expandFilters = () => this.setState({ isFiltersExpanded: true });

  getIsFiltersExpanded() {
    const { question } = this.props;
    const { isFiltersExpanded } = this.state;
    return (
      isFiltersExpanded ||
      (!question.isSaved() && question.query().filters().length > 0)
    );
  }

  render() {
    const {
      question,
      originalQuestion,
      isDirty,
      isNew,
      onOpenModal,
      queryBuilderMode,
      onSetQueryBuilderMode,

      result,
      isAdmin,
      isRunnable,
      isRunning,
      isResultDirty,
      runQuestionQuery,
      cancelQuery,

      questionAlerts,
      visualizationSettings,
    } = this.props;

    const isFiltersExpanded = this.getIsFiltersExpanded();

    return (
      <div>
        <ViewSection>
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
                <QuestionDataSource question={question} />
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
          </div>
        </ViewSection>
        {isFiltersExpanded && (
          <ViewSection>
            <ViewFilters
              question={question}
              expanded
              onAdd={this.addFilter}
              onEdit={this.editFilter}
              onRemove={this.removeFilter}
            />
          </ViewSection>
        )}
        <ViewSection className="flex">
          <div className="flex-full flex-basis-none flex align-center">
            {!isFiltersExpanded && (
              <ViewFilters
                question={question}
                onAdd={this.addFilter}
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
              onRun={() => runQuestionQuery({ ignoreCache: true })}
              onCancel={() => cancelQuery()}
            />
          </div>
          <div className="flex-full flex-basis-none flex align-center justify-end text-medium text-bold">
            {QuestionRowCount.shouldRender(this.props) && (
              <QuestionRowCount className="mx1" {...this.props} />
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

const ViewHeading = ({ ...props }) => <Subhead {...props} />;

const ViewSubHeading = ({ ...props }) => (
  <div className="text-medium text-bold" {...props} />
);
