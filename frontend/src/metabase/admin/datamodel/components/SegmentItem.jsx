import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import ObjectActionSelect from "./ObjectActionSelect";

export default class SegmentItem extends Component {
  static propTypes = {
    segment: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { segment, onRetire } = this.props;

    return (
      <tr className={cx(CS.mt1, CS.mb3)}>
        <td className={cx(CS.px1, CS.py1, "text-wrap")}>
          <span className={cx(CS.flex, CS.alignCenter)}>
            <Icon name="segment" className="mr1 text-medium" />
            <span className="text-dark text-bold">{segment.name}</span>
          </span>
        </td>
        <td className={cx(CS.px1, CS.py1, "text-wrap")}>
          {segment.definition_description}
        </td>
        <td className={cx(CS.px1, CS.py1, CS.textCentered)}>
          <ObjectActionSelect
            object={segment}
            objectType="segment"
            objectTypeLocalized={t`Segment`}
            onRetire={onRetire}
          />
        </td>
      </tr>
    );
  }
}
