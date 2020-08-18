/* @flow */

import React, { Component } from "react";

import { t } from "ttag";

import { color } from "metabase/lib/colors";

import DimensionList from "../DimensionList";
import Icon from "metabase/components/Icon";

import FilterPopoverHeader from "./FilterPopoverHeader";
import FilterPopoverPicker from "./FilterPopoverPicker";
import FilterPopoverFooter from "./FilterPopoverFooter";

import ExpressionPopover from "metabase/query_builder/components/ExpressionPopover";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import type Dimension from "metabase-lib/lib/Dimension";

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

  showCustom?: boolean,
};

type State = {
  filter: ?Filter,
  choosingField: boolean,
  editingFilter: boolean,
};

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

const CUSTOM_SECTION_NAME = t`Custom Expression`;

// NOTE: this is duplicated from FilterPopover but allows you to add filters on
// the last two "stages" of a nested query, e.x. post aggregation filtering
export default class ViewFilterPopover extends Component {
  props: Props;
  state: State;

  static defaultProps = {
    style: {},
    showFieldPicker: true,
    showCustom: true,
  };

  constructor(props: Props) {
    super(props);
    const filter = props.filter instanceof Filter ? props.filter : null;
    this.state = {
      filter: filter,
      choosingField: !filter,
      editingFilter: filter ? filter.isCustom() : false,
    };
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

  handleDimensionChange = (dimension: Dimension) => {
    let filter = this.state.filter;
    if (!filter || filter.query() !== dimension.query()) {
      filter = new Filter([], null, dimension.query());
    }
    this.setFilter(
      filter.setDimension(dimension.mbql(), { useDefaultOperator: true }),
    );
    this.setState({ choosingField: false });
  };

  handleFilterChange = (newFilter: ?Filter) => {
    const filter = this.state.filter || new Filter([], null, this.props.query);
    // $FlowFixMe
    this.setFilter(filter.set(newFilter));
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
      showCustom,
    } = this.props;
    const { filter, editingFilter, choosingField } = this.state;

    if (editingFilter) {
      return (
        <ExpressionPopover
          title={CUSTOM_SECTION_NAME}
          query={query}
          expression={filter ? filter.raw() : null}
          startRule="boolean"
          isValid={filter && filter.isValid()}
          onChange={this.handleFilterChange}
          onBack={() => this.setState({ editingFilter: false })}
          onDone={this.handleCommit}
        />
      );
    }

    const dimension = filter && filter.dimension();
    if (choosingField || !dimension) {
      return (
        <div
          className={className}
          style={{ minWidth: MIN_WIDTH, overflowY: "auto", ...style }}
        >
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
                  ).filterFieldOptionSections(filter, {
                    includeSegments: showCustom,
                  })
            }
            onChangeDimension={dimension =>
              this.handleDimensionChange(dimension)
            }
            onChangeOther={item => {
              // special case for segments
              this.handleCommitFilter(item.filter, item.query);
            }}
            width={isSidebar ? null : "100%"}
            alwaysExpanded={isTopLevel || isSidebar}
          />
          {showCustom && (
            <div
              style={{ color: color("filter") }}
              className="List-section List-section--togglable"
              onClick={() => this.setState({ editingFilter: true })}
            >
              <div className="List-section-header mx2 py2 flex align-center hover-parent hover--opacity cursor-pointer">
                <span className="List-section-icon mr1 flex align-center">
                  <Icon name="filter" />
                </span>
                <h3 className="List-section-title text-wrap">
                  {CUSTOM_SECTION_NAME}
                </h3>
              </div>
            </div>
          )}
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
            onBack={() => this.setState({ choosingField: true })}
            showFieldPicker={showFieldPicker}
          />
          <FilterPopoverPicker
            className={isSidebar ? "p1" : "px1 pt1 pb1"}
            isSidebar={isSidebar}
            filter={filter}
            onFilterChange={this.handleFilterChange}
            onCommit={this.handleCommit}
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
