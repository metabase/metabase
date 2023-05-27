import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import ObjectActionSelect from "./ObjectActionSelect";

export default class SegmentItem extends Component {
  static propTypes = {
    segment: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { segment, onRetire } = this.props;

    return (
      <tr className="mt1 mb3">
        <td className="px1 py1 text-wrap">
          <span className="flex align-center">
            <Icon name="segment" className="mr1 text-medium" />
            <span className="text-dark text-bold">{segment.name}</span>
          </span>
        </td>
        <td className="px1 py1 text-wrap">{segment.definition_description}</td>
        <td className="px1 py1 text-centered">
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
