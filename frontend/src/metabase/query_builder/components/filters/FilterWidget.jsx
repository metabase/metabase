/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import FieldName from "../FieldName.jsx";
import Popover from "metabase/components/Popover.jsx";
import FilterPopover from "./FilterPopover.jsx";
import Value from "metabase/components/Value";

import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { hasFilterOptions } from "metabase/lib/query/filter";
import { getFilterArgumentFormatOptions } from "metabase/lib/schema_metadata";

import cx from "classnames";
import _ from "underscore";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { Filter } from "metabase/meta/types/Query";
import type { Value as ValueType } from "metabase/meta/types/Dataset";

type Props = {
  query: StructuredQuery,
  filter: Filter,
  index: number,
  updateFilter?: (index: number, field: Filter) => void,
  removeFilter?: (index: number) => void,
  maxDisplayValues?: number,
};
type State = {
  isOpen: boolean,
};

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

  renderOperatorFilter() {
    const { query, filter, maxDisplayValues } = this.props;
    let [op, field] = filter;
    // $FlowFixMe
    let values: ValueType[] = hasFilterOptions(filter)
      ? filter.slice(2, -1)
      : filter.slice(2);

    const dimension = query.parseFieldReference(field);
    if (!dimension) {
      return null;
    }

    const operator = dimension.operator(op);

    let formattedValues;
    // $FlowFixMe: not understanding maxDisplayValues is provided by defaultProps
    if (operator && operator.multi && values.length > maxDisplayValues) {
      formattedValues = [values.length + " selections"];
    } else if (dimension.field().isDate() && !dimension.field().isTime()) {
      formattedValues = generateTimeFilterValuesDescriptions(filter);
    } else {
      const valuesWithOptions = values.map((value, index) => [
        value,
        getFilterArgumentFormatOptions(operator, index),
      ]);
      formattedValues = valuesWithOptions
        .filter(([value, options]) => value !== undefined && !options.hide)
        .map(([value, options], index) => (
          <Value
            key={index}
            value={value}
            column={dimension.field()}
            remap
            {...options}
          />
        ));
    }

    return (
      <div className="flex flex-column justify-center" onClick={this.open}>
        <div
          className="flex align-center"
          style={{
            padding: "0.5em",
            paddingTop: "0.3em",
            paddingBottom: "0.3em",
            paddingLeft: 0,
          }}
        >
          <FieldName
            className="Filter-section Filter-section-field"
            field={field}
            tableMetadata={query.table()}
          />
          <div className="Filter-section Filter-section-operator">
            &nbsp;
            <a className="QueryOption flex align-center">
              {operator && operator.moreVerboseName}
            </a>
          </div>
        </div>
        {formattedValues.length > 0 && (
          <div className="flex align-center flex-wrap">
            {formattedValues.map((formattedValue, valueIndex) => (
              <div
                key={valueIndex}
                className="Filter-section Filter-section-value"
              >
                <span className="QueryOption">{formattedValue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  renderSegmentFilter() {
    const { query, filter } = this.props;
    const segment = _.find(query.table().segments, s => s.id === filter[1]);
    return (
      <div onClick={this.open}>
        <div
          className="flex align-center"
          style={{
            padding: "0.5em",
            paddingTop: "0.3em",
            paddingBottom: "0.3em",
            paddingLeft: 0,
          }}
        >
          <div className="Filter-section Filter-section-field">
            <span className="QueryOption">{t`Matches`}</span>
          </div>
        </div>
        <div className="flex align-center flex-wrap">
          <div className="Filter-section Filter-section-value">
            <span className="QueryOption">{segment && segment.name}</span>
          </div>
        </div>
      </div>
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
    const { filter, index, removeFilter } = this.props;
    return (
      <div
        className={cx("Query-filter p1 pl2", { selected: this.state.isOpen })}
      >
        <div className="flex justify-center">
          {filter[0] === "SEGMENT"
            ? this.renderSegmentFilter()
            : this.renderOperatorFilter()}
          {this.renderPopover()}
        </div>
        {removeFilter && (
          <a
            className="text-grey-2 no-decoration px1 flex align-center"
            onClick={() => removeFilter(index)}
          >
            <Icon name="close" size={14} />
          </a>
        )}
      </div>
    );
  }
}
