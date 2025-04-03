import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { Link } from "react-router";

import CS from "metabase/css/core/index.css";
import { Group, Icon } from "metabase/ui";

import SegmentActionSelect from "./SegmentActionSelect";

export default class SegmentItem extends Component {
  static propTypes = {
    segment: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { segment, onRetire } = this.props;

    return (
      <tr className={cx(CS.mt1, CS.mb3)}>
        <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
          <Link to={`/admin/datamodel/segment/${segment.id}`}>
            <Group align="center" display="inline-flex">
              <Icon name="segment" className={cx(CS.mr1, CS.textMedium)} />
              <span className={cx(CS.textDark, CS.textBold)}>
                {segment.name}
              </span>
            </Group>
          </Link>
        </td>
        <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
          {segment.definition_description}
        </td>
        <td className={cx(CS.px1, CS.py1, CS.textCentered)}>
          <SegmentActionSelect object={segment} onRetire={onRetire} />
        </td>
      </tr>
    );
  }
}
