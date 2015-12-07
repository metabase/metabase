import React, { Component, PropTypes } from "react";

import SegmentActionSelect from "./SegmentActionSelect.jsx";

export default class SegmentItem extends Component {
    static propTypes = {
        segment: PropTypes.object.isRequired,
    };

    render() {
        let { segment } = this.props;

        return (
            <tr className="mt1 mb3">
                <td className="px1">
                     {segment.name}
                </td>
                <td className="px1 text-ellipsis">
                    Filtered by {segment.rule}
                </td>
                <td className="px1 text-centered">
                    <SegmentActionSelect segment={segment}/>
                </td>
            </tr>
        )
    }
}
