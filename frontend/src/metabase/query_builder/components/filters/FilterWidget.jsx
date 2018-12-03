/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";
import FilterPopover from "./FilterPopover.jsx";
import Filter from "metabase/query_builder/components/Filter";

import cx from "classnames";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { Filter as FilterType } from "metabase/meta/types/Query";
import type { FilterRenderer } from "metabase/query_builder/components/Filter";

type Props = {
  query: StructuredQuery,
  filter: FilterType,
  index: number,
  updateFilter?: (index: number, field: FilterType) => void,
  removeFilter?: (index: number) => void,
  maxDisplayValues?: number,
};
type State = {
  isOpen: boolean,
};

export const filterWidgetFilterRenderer: FilterRenderer = ({
  field,
  operator,
  values,
}) => (
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

export default class FilterWidget extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      isOpen: this.props.filter[0] == undefined,
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
      <Filter
        metadata={query && query.metadata && query.metadata()}
        {...this.props}
      >
        {filterWidgetFilterRenderer}
      </Filter>
    );
  }

  renderPopover() {
    if (this.state.isOpen) {
      const { query, filter } = this.props;
      return (
        <Popover
          id="FilterPopover"
          ref="filterPopover"
          className="FilterPopover"
          isInitiallyOpen={this.props.filter[1] === null}
          onClose={this.close}
          horizontalAttachments={["left", "center"]}
          autoWidth
        >
          <FilterPopover
            query={query}
            filter={filter}
            onCommitFilter={filter =>
              this.props.updateFilter &&
              this.props.updateFilter(this.props.index, filter)
            }
            onClose={this.close}
          />
        </Popover>
      );
    }
  }

  render() {
    const { index, removeFilter } = this.props;
    return (
      <div
        className={cx("Query-filter p1 pl2", { selected: this.state.isOpen })}
      >
        <div className="flex justify-center" onClick={this.open}>
          {this.renderFilter()}
          {this.renderPopover()}
        </div>
        {removeFilter && (
          <a
            className="text-light no-decoration px1 flex align-center"
            onClick={() => removeFilter(index)}
          >
            <Icon name="close" size={14} />
          </a>
        )}
      </div>
    );
  }
}
