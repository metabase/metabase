/* eslint-disable react/prop-types */
import { Component } from "react";
import { findDOMNode } from "react-dom";
import { t } from "ttag";
import FilterWidget from "./FilterWidget";

export default class FilterWidgetList extends Component {
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
      <div className="Query-filterList ml2 scroll-x scroll-show">
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
