import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import ObjectActionSelect from "./ObjectActionSelect";

export default class MetricItem extends Component {
  static propTypes = {
    metric: PropTypes.object.isRequired,
    onRetire: PropTypes.func.isRequired,
  };

  render() {
    const { metric, onRetire } = this.props;

    return (
      <tr>
        <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
          <span className={cx(CS.flex, CS.alignCenter)}>
            <Icon name="sum" className={cx(CS.mr1, CS.textMedium)} />
            <span className={cx(CS.textDark, CS.textBold)}>{metric.name}</span>
          </span>
        </td>
        <td className={cx(CS.px1, CS.py1, CS.textWrap)}>
          {metric.definition_description}
        </td>
        <td className={cx(CS.px1, CS.py1, CS.textCentered)}>
          <ObjectActionSelect
            object={metric}
            objectType="metric"
            objectTypeLocalized={t`Metric`}
            onRetire={onRetire}
          />
        </td>
      </tr>
    );
  }
}
