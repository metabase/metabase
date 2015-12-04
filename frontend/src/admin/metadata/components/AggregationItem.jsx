import React, { Component, PropTypes } from "react";

import AggregationActionSelect from "./AggregationActionSelect.jsx";

export default class AggregationItem extends Component {
    static propTypes = {
        aggregation: PropTypes.object.isRequired,
    };

    render() {
        let { aggregation } = this.props;

        return (
            <tr className="mt1 mb3">
                <td className="px1">
                    {aggregation.name}
                </td>
                <td className="px1 text-ellipsis">
                    {aggregation.formula}
                </td>
                <td className="px1 text-centered">
                    <AggregationActionSelect aggregation={aggregation}/>
                </td>
            </tr>
        )
    }
}
