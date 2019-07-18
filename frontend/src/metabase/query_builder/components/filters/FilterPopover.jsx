/* @flow */

import React from "react";

import FieldList from "../FieldList";

import FilterPopoverHeader from "./FilterPopoverHeader";
import FilterPopoverPicker from "./FilterPopoverPicker";
import FilterPopoverFooter from "./FilterPopoverFooter";

import { color } from "metabase/lib/colors";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { FieldFilter, ConcreteField } from "metabase/meta/types/Query";

import Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  maxHeight?: number,
  query: StructuredQuery,
  filter?: Filter,
  onChangeFilter: (filter: Filter) => void,
  onClose: () => void,
  showFieldPicker?: boolean,
};

type State = {
  filter: Filter,
};

// NOTE: this is duplicated from FilterPopover. Consider merging them
export default class FilterPopover extends React.Component {
  props: Props;
  state: State;

  static defaultProps = {
    style: {},
    showFieldPicker: true,
    // TODO: remove this
    className: "full",
  };

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

  componentWillReceiveProps(nextProps) {
    const { filter } = this.state;
    // HACK?: if the underlying query changes (e.x. additional metadata is loaded) update the filter's query
    if (filter && this.props.query !== nextProps.query) {
      this.setState({
        filter: filter.setQuery(nextProps.query),
      });
    }
  }

  handleCommit = () => {
    this.handleCommitFilter(this.state.filter);
  };

  handleCommitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.handleCommitFilter(this.state.filter);
    }
  };

  handleCommitFilter = (filter: FieldFilter) => {
    const { query } = this.props;
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

  handleFieldChange = (fieldRef: ConcreteField) => {
    this.setState({
      filter: this.state.filter.setDimension(fieldRef, {
        useDefaultOperator: true,
      }),
    });
  };

  handleFilterChange = (newFilter: FieldFilter) => {
    this.setState({ filter: this.state.filter.set(newFilter) });
  };

  handleClearField = () => {
    this.setState({ filter: this.state.filter.setDimension(null) });
  };

  render() {
    const { className, style, query, showFieldPicker } = this.props;
    const { filter } = this.state;

    const dimension = filter.dimension();
    if (filter.isSegmentFilter() || !dimension) {
      return (
        <div className={className} style={style}>
          <FieldList
            className="text-purple"
            style={{ color: color("filter") }}
            maxHeight={this.props.maxHeight}
            field={dimension && dimension.mbql()}
            fieldOptions={query.filterFieldOptions(filter)}
            segmentOptions={query.filterSegmentOptions(filter)}
            table={query.table()}
            onFieldChange={this.handleFieldChange}
            onFilterChange={this.handleCommitFilter}
          />
        </div>
      );
    } else {
      return (
        <div
          className={className}
          style={{
            minWidth: 300,
            // $FlowFixMe
            maxWidth: dimension.field().isDate() ? 600 : 500,
            // $FlowFixMe
            ...style,
          }}
        >
          <FilterPopoverHeader
            className="mx1 mt2 mb1"
            filter={filter}
            showFieldPicker={showFieldPicker}
            onFilterChange={this.handleFilterChange}
            onClearField={this.handleClearField}
          />
          <FilterPopoverPicker
            className="mx1 mt1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
          <FilterPopoverFooter
            className="mx1 mt1 mb1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
          />
        </div>
      );
    }
  }
}
