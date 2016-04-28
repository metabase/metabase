import React, { Component, PropTypes } from "react";
import { findDOMNode } from 'react-dom';

import FilterWidget from './FilterWidget.jsx';

export default class FilterList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
          shouldScroll: false
        };
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidUpdate () {
      this.state.shouldScroll ? (findDOMNode(this).scrollLeft = findDOMNode(this).scrollWidth) : null;
    }

    componentWillReceiveProps (nextProps) {
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
                {filters.slice(1).map((filter, index) =>
                    <FilterWidget
                        key={index}
                        placeholder="Item"
                        filter={filter}
                        tableMetadata={tableMetadata}
                        index={index+1}
                        removeFilter={this.props.removeFilter}
                        updateFilter={this.props.updateFilter}
                        maxDisplayValues={this.props.maxDisplayValues}
                    />
                )}
            </div>
        );
    }
}
