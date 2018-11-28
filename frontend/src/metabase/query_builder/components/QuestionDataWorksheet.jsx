import React from "react";

import _ from "underscore";

import { WorksheetSectionButton } from "./worksheet/WorksheetSection";

import DataSection from "./worksheet/DataSection";
import FiltersSection from "./worksheet/FiltersSection";
import SummarizeSection from "./worksheet/SummarizeSection";
import PreviewSection from "./worksheet/PreviewSection";
import ViewItSection from "./worksheet/ViewItSection";

import SECTIONS from "./worksheet/style";

const SIDEBAR_MARGIN = 25;
const SIDEBAR_WIDTH = 320;

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
    const { isRunnable, query, setDatasetQuery } = this.props;
    const { showSection } = this.state;
    console.log(this.props);

    const showFilterSection =
      query.filters().length > 0 || showSection === "filter";
    const showSummarizeSection =
      query.aggregations().length > 0 ||
      query.breakouts().length > 0 ||
      showSection === "summarize";

    const showSidebar = showFilterSection || showSummarizeSection;
    const sidebarWidth = SIDEBAR_WIDTH + SIDEBAR_MARGIN * 2;
    const sectionStyle = showSidebar ? { paddingRight: sidebarWidth } : {};

    return (
      <div className="relative">
        <DataSection style={sectionStyle} {...this.props} />
        {showFilterSection && (
          <FiltersSection style={sectionStyle} {...this.props} />
        )}
        {showSummarizeSection && (
          <SummarizeSection style={sectionStyle} {...this.props} />
        )}
        {isRunnable && (
          <PreviewSection
            style={sectionStyle}
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
        {isRunnable && <ViewItSection style={sectionStyle} {...this.props} />}
        {showSidebar && (
          <WorksheetSidebar
            query={query}
            width={sidebarWidth}
            onFieldClick={field => {
              // TODO: remove this once drag-n-drop is done
              query.addFilter(["=", field]).update(setDatasetQuery);
            }}
          />
        )}
      </div>
    );
  }
}

import FieldList from "./FieldList";

const WorksheetSidebar = ({ width, query, onFieldClick }) => (
  <div className="absolute top bottom right" style={{ width }}>
    <div
      className="bordered rounded bg-white"
      style={{
        boxShadow: "0 2px 20px rgba(0,0,0,0.25)",
        margin: SIDEBAR_MARGIN,
      }}
    >
      <FieldList
        className="text-brand"
        tableMetadata={query.tableMetadata()}
        fieldOptions={query.fieldOptions()}
        customFieldOptions={query.expressions()}
        width={width - 50}
        onFieldChange={onFieldClick}
      />
    </div>
  </div>
);
