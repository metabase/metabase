/* eslint-disable react/prop-types */
import React, { Component } from "react";

import Popover from "metabase/components/Popover";
import FilterPopover from "./FilterPopover";
import FilterComponent from "metabase/query_builder/components/Filter";

import cx from "classnames";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type PillProps = {
  field: string;
  operator: string;
  values: string[];
};

export const filterWidgetFilterRenderer = ({
  field,
  operator,
  values,
}: PillProps) => (
  <div className="flex flex-column justify-center">
    <div
      className="flex align-center"
      style={{
        padding: "0.5em",
        paddingTop: "0.3em",
        paddingBottom: "0.3em",
        paddingLeft: 0,
      }}
    >
      {field && (
        <div className="Filter-section Filter-section-field QueryOption">
          {field}
        </div>
      )}
      {field && operator ? <span>&nbsp;</span> : null}
      {operator && (
        <div className="Filter-section Filter-section-operator">
          <a className="QueryOption flex align-center">{operator}</a>
        </div>
      )}
    </div>
    {values.length > 0 && (
      <div className="flex align-center flex-wrap">
        {values.map((value, valueIndex) => (
          <div key={valueIndex} className="Filter-section Filter-section-value">
            <span className="QueryOption">{value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

type Props = {
  filter: Filter;
  query: StructuredQuery;
  updateFilter: (index: number, filter: any[]) => void;
  index: number;
  removeFilter: (index: number) => void;
};

type State = {
  isOpen: boolean;
};

export default class FilterWidget extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      isOpen: this.props.filter[0] == null,
    };
  }

  static defaultProps = {
    maxDisplayValues: 1,
  };

  open = () => {
    this.setState({ isOpen: true });
  };

  close = () => {
    this.setState({ isOpen: false });
  };

  renderFilter() {
    const { query } = this.props;
    return (
      <FilterComponent
        metadata={query && query.metadata && query.metadata()}
        {...this.props}
      >
        {filterWidgetFilterRenderer}
      </FilterComponent>
    );
  }

  renderPopover() {
    if (this.state.isOpen) {
      const { query, filter } = this.props;
      return (
        <Popover
          id="FilterPopover"
          className="FilterPopover"
          isInitiallyOpen={this.props.filter[1] === null}
          onClose={this.close}
          horizontalAttachments={["left", "center"]}
          autoWidth
        >
          <FilterPopover
            query={query}
            filter={filter}
            onChangeFilter={filter =>
              this.props.updateFilter &&
              this.props.updateFilter(this.props.index, filter)
            }
            onClose={this.close}
            isNew={false}
          />
        </Popover>
      );
    }
  }

  render() {
    return (
      <div className={cx("Query-filter", { selected: this.state.isOpen })}>
        <div className="flex justify-center" onClick={this.open}>
          {this.renderFilter()}
          {this.renderPopover()}
        </div>
      </div>
    );
  }
}
