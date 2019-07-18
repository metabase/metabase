/* @flow */

import React, { Component } from "react";

import DimensionList from "../DimensionList";

import FilterPopoverHeader from "../filters/FilterPopoverHeader";
import FilterPopoverPicker from "../filters/FilterPopoverPicker";
import FilterPopoverFooter from "../filters/FilterPopoverFooter";

import SidebarHeader from "metabase/query_builder/components/SidebarHeader";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { FieldFilter, ConcreteField } from "metabase/meta/types/Query";

import Filter from "metabase-lib/lib/queries/structured/Filter";

import { color } from "metabase/lib/colors";

type Props = {
  query: StructuredQuery,
  filter?: Filter,
  onChange: (filter: Filter) => void,
  // NOTE: this should probably be called onCommit
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

  static defaultProps = {
    style: {},
    showFieldPicker: true,
  };

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

  componentWillReceiveProps(nextProps) {
    const { filter } = this.state;
    // HACK?: if the underlying query changes (e.x. additional metadata is loaded) update the filter's query
    if (filter && this.props.query !== nextProps.query) {
      this.setState({
        filter: filter.setQuery(nextProps.query),
      });
    }
  }

  setFilter(filter) {
    this.setState({ filter });
    if (this.props.onChange) {
      this.props.onChange(filter);
    }
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
    this.setFilter(filter.setDimension(fieldRef, { useDefaultOperator: true }));
  };

  handleFilterChange = (newFilter: FieldFilter) => {
    this.setFilter(this.state.filter.set(newFilter));
  };

  handleClearField = () => {
    this.setFilter(this.state.filter.setDimension(null));
  };

  render() {
    const {
      className,
      style,
      query,
      showFieldPicker,
      fieldPickerTitle,
    } = this.props;
    const { filter } = this.state;

    const dimension = filter && filter.dimension();
    if (!dimension) {
      return (
        <div className={className} style={style}>
          {fieldPickerTitle && (
            <SidebarHeader className="mx1 my2" title={fieldPickerTitle} />
          )}
          <DimensionList
            style={{ color: color("filter") }}
            maxHeight={Infinity}
            dimension={dimension}
            sections={
              this.props.topLevel
                ? query.topLevelFilterFieldOptionSections(filter)
                : query.filterFieldOptionSections(filter)
            }
            onChangeDimension={dimension =>
              this.handleFieldChange(dimension.mbql(), dimension.query())
            }
            onChange={item => {
              this.handleCommitFilter(item.filter, item.query);
            }}
            width={null}
            alwaysExpanded
          />
        </div>
      );
    } else {
      return (
        <div className={className} style={style}>
          <FilterPopoverHeader
            className="mx1 mt2 mb1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onClearField={this.handleClearField}
            showFieldPicker={showFieldPicker}
          />
          <FilterPopoverPicker
            className="mx1 mt1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            width={null}
          />
          <FilterPopoverFooter
            className="mx1 mt1 mb1"
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={!this.props.noCommitButton ? this.handleCommit : null}
          />
        </div>
      );
    }
  }
}
