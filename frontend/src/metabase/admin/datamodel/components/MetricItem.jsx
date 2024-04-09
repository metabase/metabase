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
        <td className={cx(CS.px1, CS.py1, "text-wrap")}>
          <span className={cx(CS.flex, CS.alignCenter)}>
            <Icon name="sum" className="mr1 text-medium" />
            <span className="text-dark text-bold">{metric.name}</span>
          </span>
        </td>
        <td className="px1 py1 text-wrap">{metric.definition_description}</td>
        <td className="px1 py1 text-centered">
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
