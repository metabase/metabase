/* eslint-disable react/prop-types */
import React, { Component } from "react";

import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";

import DimensionList from "../../DimensionList";
import Icon from "metabase/components/Icon";

import FilterPopoverHeader from "./FilterPopoverHeader";
import FilterPopoverPicker from "./FilterPopoverPicker";
import FilterPopoverFooter from "./FilterPopoverFooter";

import ExpressionPopover from "metabase/query_builder/components/ExpressionPopover";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { FieldDimension } from "metabase-lib/lib/Dimension";
import { isStartingFrom } from "metabase/lib/query_time";
import { Button } from "./FilterPopover.styled";
import DatePicker from "../pickers/DatePicker/DatePicker";
import TimePicker from "../pickers/TimePicker";
import { DateShortcutOptions } from "../pickers/DatePicker/DatePickerShortcutOptions";

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

const CUSTOM_SECTION_NAME = t`Custom Expression`;

type Props = {
  className?: string;
  style?: React.CSSProperties;
  fieldPickerTitle?: string;
  filter: Filter;
  query: StructuredQuery;
  onChange?: (filter: Filter) => void;
  onChangeFilter: (filter: Filter) => void;

  onClose?: () => void;
  commitOnBlur?: boolean;

  noCommitButton?: boolean;
  showFieldPicker?: boolean;
  showOperatorSelector?: boolean;
  dateShortcutOptions?: DateShortcutOptions;
  showCustom?: boolean;
  isNew?: boolean;
  isTopLevel?: boolean;
  checkedColor?: string;
};

type State = {
  filter: Filter | null;
  choosingField: boolean;
  editingFilter: boolean;
};

// NOTE: this is duplicated from FilterPopover but allows you to add filters on
// the last two "stages" of a nested query, e.x. post aggregation filtering
export default class FilterPopover extends Component<Props, State> {
  static defaultProps = {
    style: {},
    showFieldPicker: true,
    showCustom: true,
    commitOnBlur: false,
  };

  constructor(props: Props) {
    super(props);
    const filter = props.filter instanceof Filter ? props.filter : null;
    this.state = {
      filter: filter,
      choosingField: !filter,
      editingFilter: filter
        ? filter.isCustom() && !isStartingFrom(filter)
        : false,
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps: Props) {
    const { filter } = this.state;
    // HACK?: if the underlying query changes (e.x. additional metadata is loaded) update the filter's query
    if (filter && this.props.query !== nextProps.query) {
      this.setState({
        filter: filter.setQuery(nextProps.query),
      });
    }
  }

  componentWillUnmount() {
    this.props.commitOnBlur && this.handleCommit();
  }

  setFilter(filter: Filter, hideShortcuts = true) {
    this.setState({
      filter,
    });
    if (this.props.onChange) {
      this.props.onChange(filter);
    }
  }

  handleUpdateAndCommit = (newFilter: any[]) => {
    const base = this.state.filter || new Filter([], null, this.props.query);
    const filter = base.set(newFilter);
    this.setState({ filter }, () => {
      this.handleCommitFilter(filter, this.props.query);
    });
  };

  handleCommit = (filter?: any[]) => {
    this.handleCommitFilter(
      filter ? this.state.filter?.set(filter) : this.state.filter,
      this.props.query,
    );
  };

  // we should only commit the filter once to prevent
  // inconsistent filters from being committed
  handleCommitFilter = _.once(
    (filter: Filter | null, query: StructuredQuery) => {
      if (filter && !(filter instanceof Filter)) {
        filter = new Filter(filter, null, query);
      }
      if (filter && filter.isValid() && this.props.onChangeFilter) {
        this.props.onChangeFilter(filter);
        if (this.props.onClose) {
          this.props.onClose();
        }
      }
    },
  );

  handleDimensionChange = (dimension: FieldDimension) => {
    let filter = this.state.filter;
    const field = dimension?.field();
    if (!filter || filter.query() !== dimension.query() || field?.isDate?.()) {
      filter = new Filter(
        [],
        null,
        dimension.query() || (filter && filter.query()) || this.props.query,
      );
    }
    this.setFilter(
      filter.setDimension(dimension.mbql(), { useDefaultOperator: true }),
      false,
    );
    this.setState({ choosingField: false });
  };

  handleFilterChange = (mbql: any[] = []) => {
    const newFilter = new Filter(
      mbql,
      this.state.filter?.index(),
      this.props.query,
    );

    this.setFilter(newFilter);
  };

  render() {
    const {
      className,
      style,
      query,
      showFieldPicker,
      showOperatorSelector,
      fieldPickerTitle,
      isTopLevel,
      showCustom,
      dateShortcutOptions,
      checkedColor,
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
          onDone={this.handleUpdateAndCommit}
          onBack={() => this.setState({ editingFilter: false })}
        />
      );
    }

    const dimension = filter && filter.dimension();
    if (!filter || choosingField || !dimension) {
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
            onChangeDimension={(dimension: FieldDimension) =>
              this.handleDimensionChange(dimension)
            }
            onChangeOther={(item: {
              filter: Filter;
              query: StructuredQuery;
            }) => {
              // special case for segments
              this.handleCommitFilter(item.filter, item.query);
            }}
            width="100%"
            alwaysExpanded={isTopLevel}
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
      const field = dimension.field();
      const isNew = this.props.isNew || !this.props.filter?.operator();
      const primaryColor = color("brand");
      const onBack = () => {
        this.setState({ choosingField: true });
      };

      const shouldShowDatePicker = field?.isDate() && !field?.isTime();
      const supportsExpressions = query.database()?.supportsExpressions();

      return (
        <div className={className} style={{ minWidth: MIN_WIDTH, ...style }}>
          {shouldShowDatePicker ? (
            <DatePicker
              className={className}
              filter={filter}
              dateShortcutOptions={dateShortcutOptions}
              primaryColor={primaryColor}
              minWidth={MIN_WIDTH}
              maxWidth={MAX_WIDTH}
              onBack={onBack}
              onCommit={this.handleCommit}
              onFilterChange={this.handleFilterChange}
              disableChangingDimension={!showFieldPicker}
              supportsExpressions={supportsExpressions}
            >
              <Button
                data-ui-tag="add-filter"
                primaryColor={primaryColor}
                disabled={!filter.isValid()}
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                ml="auto"
                onClick={() => this.handleCommit()}
              >
                {isNew ? t`Add filter` : t`Update filter`}
              </Button>
            </DatePicker>
          ) : (
            <div>
              {field?.isTime() ? (
                <TimePicker
                  className={className}
                  filter={filter}
                  primaryColor={primaryColor}
                  minWidth={MIN_WIDTH}
                  maxWidth={MAX_WIDTH}
                  onBack={onBack}
                  onCommit={this.handleCommit}
                  onFilterChange={this.handleFilterChange}
                />
              ) : (
                <>
                  <FilterPopoverHeader
                    filter={filter}
                    onFilterChange={this.handleFilterChange}
                    onBack={onBack}
                    showFieldPicker={showFieldPicker}
                    forceShowOperatorSelector={showOperatorSelector}
                  />
                  <FilterPopoverPicker
                    className="px1 pt1 pb1"
                    filter={filter}
                    onFilterChange={this.handleFilterChange}
                    onCommit={this.handleCommit}
                    maxWidth={MAX_WIDTH}
                    primaryColor={primaryColor}
                    checkedColor={checkedColor}
                  />
                </>
              )}
              <FilterPopoverFooter
                className="px1 pb1"
                filter={filter}
                onFilterChange={this.handleFilterChange}
                onCommit={!this.props.noCommitButton ? this.handleCommit : null}
                isNew={isNew}
              />
            </div>
          )}
        </div>
      );
    }
  }
}
