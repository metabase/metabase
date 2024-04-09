/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { findDOMNode } from "react-dom";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";

import { FilterWidget } from "../FilterWidget";

/**
 * @deprecated use MLv2
 */
export class FilterWidgetList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      shouldScroll: false,
    };
  }

  componentDidUpdate() {
    this.state.shouldScroll
      ? (findDOMNode(this).scrollLeft = findDOMNode(this).scrollWidth)
      : null;
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    // only scroll when a filter is added
    if (nextProps.filters.length > this.props.filters.length) {
      this.setState({ shouldScroll: true });
    } else {
      this.setState({ shouldScroll: false });
    }
  }

  componentDidMount() {
    this.componentDidUpdate();
  }

  render() {
    const { query, filters } = this.props;
    return (
      <div
        className={cx(
          QueryBuilderS.QueryFilterList,
          CS.ml2,
          CS.scrollX,
          CS.scrollShow,
        )}
      >
        {filters.map((filter, index) => (
          <FilterWidget
            key={index}
            placeholder={t`Item`}
            query={query}
            filter={filter}
            index={index}
            removeFilter={this.props.removeFilter}
            updateFilter={this.props.updateFilter}
            maxDisplayValues={this.props.maxDisplayValues}
          />
        ))}
      </div>
    );
  }
}
