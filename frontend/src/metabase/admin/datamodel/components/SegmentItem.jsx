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
      <tr className="mt1 mb3">
        <td className={cx("px1 py1", CS.textWrap)}>
          <span className={cx(CS.flex, CS.alignCenter)}>
            <Icon name="segment" className="mr1 text-medium" />
            <span className={cx("text-dark", CS.textBold)}>{segment.name}</span>
          </span>
        </td>
        <td className={cx("px1 py1", CS.textWrap)}>
          {segment.definition_description}
        </td>
        <td className={cx("px1 py1", CS.textCentered)}>
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
