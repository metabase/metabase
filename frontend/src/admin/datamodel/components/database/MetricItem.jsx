import React, { Component, PropTypes } from "react";

import MetricActionSelect from "./MetricActionSelect.jsx";

export default class MetricItem extends Component {
    static propTypes = {
        metric: PropTypes.object.isRequired,
    };

    render() {
        let { metric } = this.props;

        return (
            <tr className="mt1 mb3">
                <td className="px1">
                    {metric.name}
                </td>
                <td className="px1 text-ellipsis">
                    {metric.formula}
                </td>
                <td className="px1 text-centered">
                    <MetricActionSelect metric={metric}/>
                </td>
            </tr>
        )
    }
}
