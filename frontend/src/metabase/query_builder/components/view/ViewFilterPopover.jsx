/* @flow */

import React, { Component } from "react";
import cx from "classnames";

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
  filter: ?Filter,
};

// NOTE: this is duplicated from FilterPopover but allows you to add filters on
// the last two "stages" of a nested query, e.x. post aggregation filtering
export default class ViewFilterPopover extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      filter: props.filter instanceof Filter ? props.filter : null,
    };
  }

  componentWillMount() {
    window.addEventListener("keydown", this.handleCommitOnEnter);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleCommitOnEnter);
  }

  handleCommit = () => {
    this.handleCommitFilter(this.state.filter, this.props.query);
  };

  handleCommitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.handleCommitFilter(this.state.filter, this.props.query);
    }
  };

  handleCommitFilter = (filter: ?FieldFilter, query: StructuredQuery) => {
    if (filter && !(filter instanceof Filter)) {
      filter = new Filter(filter, null, query);
    }
    if (filter && filter.isValid()) {
      this.props.onChangeFilter(filter);
      if (this.props.onClose) {
        this.props.onClose();
      }
    }
  };

  handleFieldChange = (fieldRef: ConcreteField, query: StructuredQuery) => {
    const filter = this.state.filter || new Filter([], null, query);
    this.setState({
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
    const { className, style } = this.props;
    const { filter } = this.state;

    if (!filter || (!filter.isSegmentFilter() && !filter.dimension())) {
      const dimension = filter && filter.dimension();
      const queries = this.props.filter
        ? [this.props.filter.query()]
        : this._queries();
      return (
        <div className={className} style={style}>
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
        <div className={className} style={style}>
          <FilterPopoverHeader
            className="p1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onClearField={this.handleClearField}
            showFieldPicker
          />
          <FilterPopoverPicker
            className="p1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
          <FilterPopoverFooter
            className="p1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
        </div>
      );
    }
  }
}
