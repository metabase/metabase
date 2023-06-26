/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import Filter from "./Filter";
import { filterWidgetFilterRenderer } from "./filters/FilterWidget";

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

class FilterList extends Component {
  static defaultProps = {
    filterRenderer: filterWidgetFilterRenderer,
  };

  render() {
    const { filters, metadata, filterRenderer } = this.props;
    return (
      <div className="Query-filterList scroll-x scroll-show">
        {filters.map((filter, index) => (
          <Filter
            key={index}
            filter={filter}
            metadata={metadata}
            maxDisplayValues={this.props.maxDisplayValues}
          >
            {filterRenderer}
          </Filter>
        ))}
      </div>
    );
  }
}

export default connect(mapStateToProps)(FilterList);
