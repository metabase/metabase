import React, { Component } from "react";
import PropTypes from "prop-types";

import ObjectActionSelect from "../ObjectActionSelect.jsx";

import Query from "metabase/lib/query";

export default class MetricItem extends Component {
  static propTypes = {
    metric: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    let { metric, tableMetadata } = this.props;

    let description = Query.generateQueryDescription(
      tableMetadata,
      metric.definition,
      { sections: ["aggregation", "filter"], jsx: true },
    );

    return (
      <tr className="mt1 mb3">
        <td className="px1">{metric.name}</td>
        <td className="px1 text-ellipsis">{description}</td>
        <td className="px1 text-centered">
          <ObjectActionSelect
            object={metric}
            objectType="metric"
            onRetire={this.props.onRetire}
          />
        </td>
      </tr>
    );
  }
}
