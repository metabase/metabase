import React from "react";

import { t } from "c-3po";

import Button from "metabase/components/Button";
import Subhead from "metabase/components/Subhead";
import ViewSection from "./ViewSection";

import CollectionBadge from "metabase/questions/components/CollectionBadge";
import DataSource from "./DataSource";
import ViewFilters from "./ViewFilters";
import QuestionEntityMenu from "./QuestionEntityMenu";

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
      isDirty,
      isNew,
      onOpenModal,
      queryBuilderMode,
      onSetQueryBuilderMode,
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
                <Subhead>{question.displayName()}</Subhead>
                <QuestionEntityMenu
                  className="ml1"
                  question={question}
                  onOpenModal={onOpenModal}
                />
              </div>
              <div className="p1">
                <DataSource question={question} subHead />
              </div>
            </div>
          ) : (
            <div className="flex align-center">
              <DataSource question={question} />
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
        <ViewSection>
          {!isFiltersExpanded && (
            <ViewFilters
              question={question}
              onAdd={this.addFilter}
              onExpand={this.expandFilters}
            />
          )}
        </ViewSection>
      </div>
    );
  }
}
