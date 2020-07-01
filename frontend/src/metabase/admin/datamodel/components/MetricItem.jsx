import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import ObjectActionSelect from "./ObjectActionSelect";

import * as Q_DEPRECATED from "metabase/lib/query";

export default class MetricItem extends Component {
  static propTypes = {
    metric: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { metric, onRetire } = this.props;

    const description = Q_DEPRECATED.formatQueryDescription(
      metric.query_description,
      metric.definition,
      { sections: ["table", "aggregation", "filter"], jsx: true },
    );

    return (
      <tr className="mt1 mb3">
        <td className="px1 text-wrap">
          <span className="flex align-center">
            <Icon name={metric.getIcon()} className="mr1" />
            {metric.name}
          </span>
        </td>
        <td className="px1 text-wrap">{description}</td>
        <td className="px1 text-centered">
          <ObjectActionSelect
            object={metric}
            objectType="metric"
            onRetire={onRetire}
          />
        </td>
      </tr>
    );
  }
}
