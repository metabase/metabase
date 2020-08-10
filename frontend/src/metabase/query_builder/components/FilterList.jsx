/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import Filter from "./Filter";
import { filterWidgetFilterRenderer } from "./filters/FilterWidget";

import { getMetadata } from "metabase/selectors/metadata";

import type { Filter as FilterType } from "metabase-types/types/Query";
import type { FilterRenderer } from "./Filter";

type Props = {
  filters: Array<FilterType>,
  maxDisplayValues?: number,
  filterRenderer?: FilterRenderer,
};

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

@connect(mapStateToProps)
export default class FilterList extends Component {
  props: Props;

  static defaultProps = {
    filterRenderer: filterWidgetFilterRenderer,
  };

  render() {
    // $FlowFixMe: metadata provided by @connect
    const { filters, metadata, filterRenderer } = this.props;
    return (
      <div className="Query-filterList scroll-x scroll-show">
        {filters.map((filter, index) => (
          <Filter
            key={index}
            filter={filter}
            metadata={metadata}
            maxDisplayValues={this.props.maxDisplayValues}
            children={filterRenderer}
          />
        ))}
      </div>
    );
  }
}
