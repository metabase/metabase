/* @flow */

import React, { Component } from "react";
import { findDOMNode } from 'react-dom';

import FilterWidget from './FilterWidget.jsx';

import StructuredQuery from "metabase-lib/lib/StructuredQuery";
import type { Filter } from "metabase/meta/types/Query";

type Props = {
    query: StructuredQuery,
    filters: Array<Filter>,
    removeFilter?: (index: number) => void,
    updateFilter?: (index: number, filter: Filter) => void,
    maxDisplayValues?: number
};

type State = {
    shouldScroll: bool
};

export default class FilterList extends Component {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
          shouldScroll: false
        };
    }

    componentDidUpdate () {
      this.state.shouldScroll ? (findDOMNode(this).scrollLeft = findDOMNode(this).scrollWidth) : null;
    }

    componentWillReceiveProps (nextProps: Props) {
      // only scroll when a filter is added
      if(nextProps.filters.length > this.props.filters.length) {
        this.setState({ shouldScroll: true })
      } else {
        this.setState({ shouldScroll: false })
      }
    }

    componentDidMount () {
      this.componentDidUpdate();
    }

    render() {
        const { query, filters } = this.props;
        return (
            <div className="Query-filterList scroll-x scroll-show scroll-show--horizontal">
                {filters.map((filter, index) =>
                    <FilterWidget
                        key={index}
                        placeholder="Item"
                        // $FlowFixMe: update widgets that are still passing tableMetadata instead of query
                        query={query || { table: () => this.props.tableMetadata }}
                        filter={filter}
                        index={index}
                        removeFilter={this.props.removeFilter}
                        updateFilter={this.props.updateFilter}
                        maxDisplayValues={this.props.maxDisplayValues}
                    />
                )}
            </div>
        );
    }
}
