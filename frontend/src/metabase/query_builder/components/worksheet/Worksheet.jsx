import React from "react";

import _ from "underscore";

import { WorksheetSectionButton } from "./WorksheetSection";

import QuerySections from "./QuerySections";
import ViewItSection from "./ViewItSection";
import PreviewSection from "./PreviewSection";

import WorksheetSidebar from "./WorksheetSidebar";

import FieldsBarWithExpressionEditor from "./FieldsBarWithExpressionEditor";

import Toggle from "metabase/components/Toggle";

import SECTIONS from "./style";

const SIDEBAR_MARGIN = 25;
const SIDEBAR_WIDTH = 320;

export default class Worksheet extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      previewLimit: 10,
      isPickerOpen: false,
      autoRefreshPreview: true,
    };
  }

  componentDidMount() {
    // auto load the preview if autoRefreshPreview is true and it's out of date
    if (
      !this.isPreviewCurrent() &&
      !this.props.isRunning &&
      this.state.autoRefreshPreview
    ) {
      this.preview();
    }
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
      this.props.lastRunCard &&
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

  handleToggleAutoRefreshPreview = value => {
    this.setState({ autoRefreshPreview: value });
    if (value && !this.isPreviewCurrent()) {
      this.preview();
    }
  };

  handleSetDatasetQuery = (...args) => {
    this.props.setDatasetQuery(...args);
    if (this.state.autoRefreshPreview) {
      setTimeout(this.preview);
    }
  };

  render() {
    const { isRunnable, query } = this.props;
    const { isPickerOpen } = this.state;

    const showSidebar = isPickerOpen;

    const sidebarWidth = SIDEBAR_WIDTH + SIDEBAR_MARGIN * 2;
    const sectionStyle = showSidebar ? { paddingRight: sidebarWidth } : {};

    return (
      <div className="relative flex flex-row flex-full">
        <div className="border-right" style={{ minWidth: 300 }}>
          <QuerySections
            {...this.props}
            sectionStyle={sectionStyle}
            setDatasetQuery={this.handleSetDatasetQuery}
          />
          {isRunnable && <ViewItSection style={sectionStyle} {...this.props} />}
        </div>
        <div className="pl4 flex-full bg-white">
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
              <div className="flex align-center">
                <span className="mr1">Refresh Preview:</span>
                <Toggle
                  small
                  value={this.state.autoRefreshPreview}
                  onChange={this.handleToggleAutoRefreshPreview}
                />
              </div>
            </PreviewSection>
          )}
        </div>
        {showSidebar && (
          <WorksheetSidebar
            query={query}
            margin={SIDEBAR_MARGIN}
            width={sidebarWidth}
            onFieldClick={field => {
              // TODO: remove this once drag-n-drop is done
              query.addFilter(["=", field]).update(this.handleSetDatasetQuery);
            }}
          />
        )}
      </div>
    );
  }
}
