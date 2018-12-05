import React from "react";

import _ from "underscore";

import { WorksheetSectionButton } from "./WorksheetSection";

import DataSection from "./DataSection";
import FiltersSection from "./FiltersSection";
import SummarizeSection from "./SummarizeSection";
import PreviewSection from "./PreviewSection";
import ViewItSection from "./ViewItSection";

import WorksheetSidebar from "./WorksheetSidebar";

import FieldsBar from "./FieldsBar";

import SECTIONS from "./style";

const SIDEBAR_MARGIN = 25;
const SIDEBAR_WIDTH = 320;

export default class Worksheet extends React.Component {
  constructor(props) {
    super(props);
    const { query } = props;
    this.state = {
      previewLimit: 10,
      showFilterSection: query.filters().length > 0,
      showSummarizeSection:
        query.aggregations().length > 0 || query.breakouts().length > 0,
      isPickerOpen: false,
    };
  }

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
    return (
      this.props.rawSeries &&
      _.isEqual(
        this.props.lastRunCard.dataset_query,
        this.getPreviewCard().dataset_query,
      )
    );
  }

  isPreviewDisabled() {
    const { query } = this.props;
    const { showSummarizeSection } = this.state;

    // disable preview if we're showing the new (empty) summarize section
    return (
      showSummarizeSection &&
      query.aggregations().length === 0 &&
      query.breakouts().length === 0
    );
  }

  setPreviewLimit = previewLimit => {
    this.setState({ previewLimit }, this.preview);
  };

  filter = () => {
    this.setState({ showFilterSection: true });
  };

  summarize = () => {
    this.setState({ showSummarizeSection: true });
  };

  openPicker = () => {
    this.setState({ isPickerOpen: true });
  };
  closePicker = () => {
    this.setState({ isPickerOpen: false });
  };

  reset = () => {
    this.setState({
      isPickerOpen: false,
      showFilterSection: false,
      showSummarizeSection: false,
    });
  };

  render() {
    const { isRunnable, query, setDatasetQuery } = this.props;
    const { isPickerOpen } = this.state;

    const showFilterSection =
      isRunnable &&
      (this.state.showFilterSection || query.filters().length > 0);
    const showSummarizeSection =
      isRunnable &&
      (this.state.showSummarizeSection ||
        query.aggregations().length > 0 ||
        query.breakouts().length > 0);

    const showSidebar = isPickerOpen;

    const sidebarWidth = SIDEBAR_WIDTH + SIDEBAR_MARGIN * 2;
    const sectionStyle = showSidebar ? { paddingRight: sidebarWidth } : {};

    return (
      <div className="relative">
        <DataSection
          style={sectionStyle}
          {...this.props}
          setSourceTableFn={tableId => {
            this.props.setSourceTableFn(tableId);
            // make sure we reset state when switching tables
            this.reset();
          }}
        >
          {(showFilterSection || showSummarizeSection) && (
            <FieldsBar
              color={SECTIONS.data.color}
              fieldOptions={query.fieldOptions()}
              isPickerOpen={isPickerOpen}
              onOpenPicker={this.openPicker}
              onClosePicker={this.closePicker}
            />
          )}
          {isRunnable &&
            !showFilterSection &&
            showSummarizeSection && <FilterButton onClick={this.filter} />}
        </DataSection>
        {showFilterSection && (
          <FiltersSection
            style={sectionStyle}
            onClear={() => this.setState({ showFilterSection: false })}
            {...this.props}
          />
        )}
        {showSummarizeSection && (
          <SummarizeSection
            style={sectionStyle}
            onClear={() => this.setState({ showSummarizeSection: false })}
            {...this.props}
          />
        )}
        {isRunnable && (
          <PreviewSection
            style={sectionStyle}
            {...this.props}
            preview={this.preview}
            previewLimit={this.state.previewLimit}
            setPreviewLimit={this.setPreviewLimit}
            isPreviewCurrent={this.isPreviewCurrent()}
            isPreviewDisabled={this.isPreviewDisabled()}
          >
            {isRunnable &&
              !showSummarizeSection && (
                <SummarizeButton onClick={this.summarize} />
              )}
            {isRunnable &&
              !showFilterSection &&
              !showSummarizeSection && <FilterButton onClick={this.filter} />}
          </PreviewSection>
        )}
        {isRunnable && <ViewItSection style={sectionStyle} {...this.props} />}
        {showSidebar && (
          <WorksheetSidebar
            query={query}
            margin={SIDEBAR_MARGIN}
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

const FilterButton = ({ onClick }) => (
  <WorksheetSectionButton
    {...SECTIONS.filter}
    className="mr1 mt2"
    onClick={onClick}
  />
);

const SummarizeButton = ({ onClick }) => (
  <WorksheetSectionButton
    {...SECTIONS.summarize}
    className="mr1 mt2"
    onClick={onClick}
  />
);
