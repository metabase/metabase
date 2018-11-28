import React from "react";

import _ from "underscore";

import { WorksheetSectionButton } from "./worksheet/WorksheetSection";

import DataSection from "./worksheet/DataSection";
import FiltersSection from "./worksheet/FiltersSection";
import SummarizeSection from "./worksheet/SummarizeSection";
import PreviewSection from "./worksheet/PreviewSection";
import ViewItSection from "./worksheet/ViewItSection";

import SECTIONS from "./worksheet/style";

export default class QuestionDataWorksheet extends React.Component {
  state = {
    previewLimit: 10,
    showSection: null,
  };

  preview = () => {
    const { runQuestionQuery } = this.props;
    runQuestionQuery({
      overrideWithCard: this.getPreviewCard(),
      shouldUpdateUrl: false,
    });
  };

  getPreviewCard() {
    const { query } = this.props;
    const { previewLimit } = this.state;
    return query
      .updateLimit(previewLimit)
      .question()
      .card();
  }

  isPreviewCurrent() {
    return _.isEqual(this.props.lastRunCard, this.getPreviewCard());
  }

  setPreviewLimit = previewLimit => {
    this.setState({ previewLimit }, this.preview);
  };

  filter = () => {
    this.setState({ showSection: "filter" });
  };

  summarize = () => {
    this.setState({ showSection: "summarize" });
  };

  render() {
    const { isRunnable, query } = this.props;
    const { showSection } = this.state;
    console.log(this.props);

    const showFilterSection =
      query.filters().length > 0 || showSection === "filter";
    const showSummarizeSection =
      query.aggregations().length > 0 ||
      query.breakouts().length > 0 ||
      showSection === "summarize";

    return (
      <div>
        <DataSection {...this.props} />
        {showFilterSection && <FiltersSection {...this.props} />}
        {showSummarizeSection && <SummarizeSection {...this.props} />}
        {isRunnable && (
          <PreviewSection
            {...this.props}
            preview={this.preview}
            previewLimit={this.state.previewLimit}
            setPreviewLimit={this.setPreviewLimit}
            isPreviewCurrent={this.isPreviewCurrent()}
          >
            {!showFilterSection && (
              <WorksheetSectionButton
                {...SECTIONS.filter}
                className="mr1"
                onClick={this.filter}
              />
            )}
            {!showSummarizeSection && (
              <WorksheetSectionButton
                {...SECTIONS.summarize}
                className="mr1"
                onClick={this.summarize}
              />
            )}
          </PreviewSection>
        )}
        {isRunnable && <ViewItSection {...this.props} />}
      </div>
    );
  }
}
