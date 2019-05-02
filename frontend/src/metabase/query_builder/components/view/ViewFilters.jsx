/* @flow */

import React, { Component } from "react";

import FieldList from "../FieldList";

import FilterPopoverHeader from "../filters/FilterPopoverHeader";
import FilterPopoverPicker from "../filters/FilterPopoverPicker";
import FilterPopoverFooter from "../filters/FilterPopoverFooter";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { FieldFilter, ConcreteField } from "metabase/meta/types/Query";

import Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  query: StructuredQuery,
  filter?: Filter,
  onChangeFilter: (filter: Filter) => void,
  onClose: () => void,
};

type State = {
  filter: Filter,
};

// NOTE: this is duplicated from FilterPopover. Consider merging them
export default class ViewFilters extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      // $FlowFixMe
      filter: new Filter(props.filter || [], null, props.query),
    };
  }

  componentWillMount() {
    window.addEventListener("keydown", this.handleCommitOnEnter);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleCommitOnEnter);
  }

  handleCommit = () => {
    this.handleCommitFilter(this.state.filter, this.state.query);
  };

  handleCommitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.handleCommitFilter(this.state.filter, this.state.query);
    }
  };

  handleCommitFilter = (filter: FieldFilter, query) => {
    if (filter.isValid()) {
      this.props.onChangeFilter(filter, query);
      if (this.props.onClose) {
        this.props.onClose();
      }
    }
  };

  handleFieldChange = (fieldRef: ConcreteField, query) => {
    const { filter } = this.state;
    filter._query = query;
    this.setState({
      query: query,
      filter: filter.setDimension(fieldRef, { useDefaultOperator: true }),
    });
  };

  handleFilterChange = (newFilter: FieldFilter) => {
    this.setState({ filter: this.state.filter.set(newFilter) });
  };

  handleClearField = () => {
    this.setState({ filter: this.state.filter.setDimension(null) });
  };

  _queries() {
    const queries = this.props.query.queries().slice(-2);
    if (queries.length === 1 && queries[0].breakouts().length > 0) {
      queries.push(queries[0].nest());
    }
    return queries.reverse();
  }

  render() {
    const { filter } = this.state;

    const dimension = filter.dimension();
    if (filter.isSegmentFilter() || !dimension) {
      const queries = this.props.filter
        ? [this.props.filter.query()]
        : this._queries();
      return (
        <div className="full p1 scroll-y">
          {queries.map(query => (
            <FieldList
              className="text-purple"
              width={410}
              maxHeight={Infinity} // just implement scrolling ourselves
              field={dimension && dimension.mbql()}
              fieldOptions={query.filterFieldOptions(filter)}
              segmentOptions={query.filterSegmentOptions(filter)}
              table={query.table()}
              onFieldChange={field => this.handleFieldChange(field, query)}
              onFilterChange={filter => this.handleCommitFilter(filter, query)}
            />
          ))}
        </div>
      );
    } else {
      return (
        <div className="full p1">
          <FilterPopoverHeader
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onClearField={this.handleClearField}
            showFieldPicker
          />
          <FilterPopoverPicker
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
          <FilterPopoverFooter
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
        </div>
      );
    }
  }
}
