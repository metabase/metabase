/* @flow */

import React, { Component } from "react";

import DimensionList from "../DimensionList";

import FilterPopoverHeader from "./FilterPopoverHeader";
import FilterPopoverPicker from "./FilterPopoverPicker";
import FilterPopoverFooter from "./FilterPopoverFooter";

import SidebarHeader from "metabase/query_builder/components/SidebarHeader";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { FieldFilter, ConcreteField } from "metabase/meta/types/Query";

import Filter from "metabase-lib/lib/queries/structured/Filter";

import { color } from "metabase/lib/colors";

type Props = {
  query: StructuredQuery,
  filter?: Filter,
  onChange?: (filter: ?Filter) => void,
  // NOTE: this should probably be called onCommit
  onChangeFilter?: (filter: Filter) => void,
  onClose: () => void,

  style?: {},
  className?: string,

  fieldPickerTitle?: string,
  showFieldPicker?: boolean,
  isTopLevel?: boolean,
  isSidebar?: boolean,
};

type State = {
  filter: ?Filter,
};

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

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

  componentWillReceiveProps(nextProps: Props) {
    const { filter } = this.state;
    // HACK?: if the underlying query changes (e.x. additional metadata is loaded) update the filter's query
    if (filter && this.props.query !== nextProps.query) {
      this.setState({
        filter: filter.setQuery(nextProps.query),
      });
    }
  }

  setFilter(filter: ?Filter) {
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

  handleCommitFilter = (filter: ?Filter, query: StructuredQuery) => {
    if (filter && !(filter instanceof Filter)) {
      filter = new Filter(filter, null, query);
    }
    if (filter && filter.isValid() && this.props.onChangeFilter) {
      this.props.onChangeFilter(filter);
      if (this.props.onClose) {
        this.props.onClose();
      }
    }
  };

  handleFieldChange = (fieldRef: ConcreteField, query: StructuredQuery) => {
    const filter = new Filter([], null, query);
    this.setFilter(filter.setDimension(fieldRef, { useDefaultOperator: true }));
  };

  handleFilterChange = (newFilter: ?FieldFilter) => {
    this.setFilter(
      newFilter && this.state.filter ? this.state.filter.set(newFilter) : null,
    );
  };

  render() {
    const {
      className,
      style,
      query,
      showFieldPicker,
      fieldPickerTitle,
      isSidebar,
      isTopLevel,
    } = this.props;
    const { filter } = this.state;

    const dimension = filter && filter.dimension();
    if (!dimension) {
      return (
        <div className={className} style={{ minWidth: MIN_WIDTH, ...style }}>
          {fieldPickerTitle && (
            <SidebarHeader className="mx1 my2" title={fieldPickerTitle} />
          )}
          <DimensionList
            style={{ color: color("filter") }}
            maxHeight={Infinity}
            dimension={dimension}
            sections={
              isTopLevel
                ? query.topLevelFilterFieldOptionSections()
                : (
                    (filter && filter.query()) ||
                    query
                  ).filterFieldOptionSections(filter)
            }
            onChangeDimension={dimension =>
              this.handleFieldChange(dimension.mbql(), dimension.query())
            }
            onChange={item => {
              this.handleCommitFilter(item.filter, item.query);
            }}
            width={isSidebar ? null : MIN_WIDTH}
            alwaysExpanded={isTopLevel || isSidebar}
          />
        </div>
      );
    } else {
      return (
        <div className={className} style={{ minWidth: MIN_WIDTH, ...style }}>
          <FilterPopoverHeader
            className={isSidebar ? "px1 pt1" : "p1 mb1 border-bottom"}
            isSidebar={isSidebar}
            filter={filter}
            onFilterChange={this.handleFilterChange}
            showFieldPicker={showFieldPicker}
          />
          <FilterPopoverPicker
            className={isSidebar ? "p1" : "px1 pt1 pb1"}
            isSidebar={isSidebar}
            filter={filter}
            onFilterChange={this.handleFilterChange}
            minWidth={isSidebar ? null : MIN_WIDTH}
            maxWidth={isSidebar ? null : MAX_WIDTH}
          />
          <FilterPopoverFooter
            className={isSidebar ? "p1" : "px1 pb1"}
            isSidebar={isSidebar}
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={!this.props.noCommitButton ? this.handleCommit : null}
            isNew={!this.props.filter}
          />
        </div>
      );
    }
  }
}
