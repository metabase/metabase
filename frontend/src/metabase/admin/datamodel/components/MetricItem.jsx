import React, { Component } from "react";
import PropTypes from "prop-types";

import Tables from "metabase/entities/tables";

import Icon from "metabase/components/Icon";
import ObjectActionSelect from "./ObjectActionSelect";
import withTableMetadataLoaded from "metabase/admin/datamodel/hoc/withTableMetadataLoaded";

import * as Q_DEPRECATED from "metabase/lib/query";

@Tables.load({
  id: (state, props) => props.metric.table_id,
  wrapped: true,
})
@withTableMetadataLoaded
export default class MetricItem extends Component {
  static propTypes = {
    metric: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
    table: PropTypes.object.isRequired,
  };

  render() {
    const { metric, onRetire, table } = this.props;

    const description = Q_DEPRECATED.generateQueryDescription(
      table,
      metric.definition,
      { sections: ["aggregation", "filter"], jsx: true },
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
