import React from "react";

import DataSection from "./DataSection";
import FiltersSection from "./FiltersSection";
import SummarizeSection from "./SummarizeSection";

import { WorksheetSectionButton } from "./WorksheetSection";

import SECTIONS from "./style";

export default class QuerySections extends React.Component {
  constructor(props) {
    super(props);
    const { query } = props;
    this.state = {
      showFilterSection: query.filters().length > 0,
      showSummarizeSection:
        query.aggregations().length > 0 || query.breakouts().length > 0,
    };
  }

  filter = () => {
    this.setState({ showFilterSection: true });
  };

  summarize = () => {
    this.setState({ showSummarizeSection: true });
  };

  reset = () => {
    this.setState({
      showFilterSection: false,
      showSummarizeSection: false,
    });
  };

  render() {
    const { query, isRunnable, className, style, sectionStyle } = this.props;

    const showFilterSection =
      isRunnable &&
      (this.state.showFilterSection || query.filters().length > 0);
    const showSummarizeSection =
      isRunnable &&
      (this.state.showSummarizeSection ||
        query.aggregations().length > 0 ||
        query.breakouts().length > 0);

    return (
      <div className={className} style={style}>
        <DataSection
          style={sectionStyle}
          {...this.props}
          setSourceTableFn={tableId => {
            this.props.setSourceTableFn(tableId);
            // make sure we reset state when switching tables
            this.reset();
          }}
          footerButtons={[
            isRunnable &&
              !showSummarizeSection &&
              !showFilterSection && (
                <SummarizeButton onClick={this.summarize} />
              ),
            isRunnable &&
              !showFilterSection && <FilterButton onClick={this.filter} />,
          ]}
        />
        {showFilterSection && (
          <FiltersSection
            style={sectionStyle}
            onClear={() => this.setState({ showFilterSection: false })}
            {...this.props}
            footerButtons={[
              isRunnable &&
                !showSummarizeSection && (
                  <SummarizeButton onClick={this.summarize} />
                ),
            ]}
          />
        )}
        {showSummarizeSection && (
          <SummarizeSection
            style={sectionStyle}
            onClear={() => this.setState({ showSummarizeSection: false })}
            {...this.props}
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
