/* @flow */

import React, { Component } from "react";
import { findDOMNode } from 'react-dom';

import FilterWidget from './FilterWidget.jsx';

import type { Filter } from "metabase/meta/types/Query";
import type { Table } from "metabase/meta/types/Table";

type Props = {
    filters: Array<Filter>,
    tableMetadata: Table,
    removeFilter: (index: number) => void,
    updateFilter: (index: number, filter: Filter) => void,
    maxDisplayValues?: bool
};

type State = {
    shouldScroll: bool
};

export default class FilterList extends Component<*, Props, State> {
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
        const { filters, tableMetadata } = this.props;
        return (
            <div className="Query-filterList scroll-x scroll-show scroll-show--horizontal">
                {filters.map((filter, index) =>
                    <FilterWidget
                        key={index}
                        placeholder="Item"
                        filter={filter}
                        tableMetadata={tableMetadata}
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
