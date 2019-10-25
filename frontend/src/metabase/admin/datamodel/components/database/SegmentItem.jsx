import React, { Component } from "react";
import PropTypes from "prop-types";

import ObjectActionSelect from "../ObjectActionSelect";

import * as Q_DEPRECATED from "metabase/lib/query";

export default class SegmentItem extends Component {
  static propTypes = {
    onRetire: PropTypes.func.isRequired,
    segment: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  render() {
    const { onRetire, segment, tableMetadata } = this.props;

    const description = Q_DEPRECATED.generateQueryDescription(
      tableMetadata,
      segment.definition,
      { sections: ["filter"], jsx: true },
    );

    return (
      <tr className="mt1 mb3">
        <td className="px1 text-wrap">{segment.name}</td>
        <td className="px1 text-wrap">{description}</td>
        <td className="px1 text-centered">
          <ObjectActionSelect
            object={segment}
            objectType="segment"
            onRetire={onRetire}
          />
        </td>
      </tr>
    );
  }
}
