import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import ObjectActionSelect from "./ObjectActionSelect";

import { formatQueryDescription } from "metabase/lib/query/description";

export default class SegmentItem extends Component {
  static propTypes = {
    segment: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { segment, onRetire } = this.props;

    const description = formatQueryDescription(segment.query_description, {
      sections: ["filter"],
      jsx: true,
    });

    return (
      <tr className="mt1 mb3">
        <td className="px1 text-wrap">
          <span className="flex align-center">
            <Icon name={segment.getIcon()} className="mr1" />
            {segment.name}
          </span>
        </td>
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
