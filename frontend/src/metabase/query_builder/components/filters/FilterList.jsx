/* @flow */

import React, { Component } from "react";
import { findDOMNode } from 'react-dom';

import FilterWidget from './FilterWidget.jsx';

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { Filter } from "metabase/meta/types/Query";
import Dimension from "metabase-lib/lib/Dimension";

import type { TableMetadata } from "metabase/meta/types/Metadata";

type Props = {
    index: number,
    query: StructuredQuery,
    filters: Array<Filter>,
    removeFilter?: (index: number) => void,
    updateFilter?: (index: number, filter: Filter) => void,
    updateClause?: (index: number, filter: Filter) => void,
    maxDisplayValues?: number,
    tableMetadata?: TableMetadata // legacy parameter
};

type State = {
    shouldScroll: bool
};

export default class FilterList extends Component {
    props: Props;
    state: State = {
        shouldScroll: false
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
        const { query, filters, tableMetadata } = this.props;

        window.q = query

        return (
            <div className="Query-filterList scroll-x scroll-show scroll-show--horizontal">
                {filters.map((filter, index) =>
                    <span className="flex align-center">
                        { index > 0 && (
                            <span
                                className="text-purple-hover"
                                onClick={() => {
                                    this.props.updateClause(this.props.index)
                                }}
                            >
                                AND
                            </span>
                        )}
                        <FilterWidget
                            key={index}
                            // TODO: update widgets that are still passing tableMetadata instead of query
                            query={query || {
                                table: () => tableMetadata,
                                parseFieldReference: (fieldRef) => Dimension.parseMBQL(fieldRef, tableMetadata)
                            }}
                            filter={filter}
                            index={index}
                            removeFilter={this.props.removeFilter}
                            updateFilter={this.props.updateFilter}
                            maxDisplayValues={this.props.maxDisplayValues}
                        />
                    </span>
                )}
            </div>
        );
    }
}
