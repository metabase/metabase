import React, { Component, PropTypes } from "react";

import SegmentActionSelect from "./SegmentActionSelect.jsx";

import Query from "metabase/lib/query";

export default class SegmentItem extends Component {
    static propTypes = {
        segment: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    render() {
        let { segment, tableMetadata } = this.props;

        let rule;
        try {
            rule = Query.getFilterDescription(tableMetadata, segment.definition.filter);
        } catch (e) {
            rule = "";
        }

        return (
            <tr className="mt1 mb3">
                <td className="px1">
                     {segment.name}
                </td>
                <td className="px1 text-ellipsis">
                    Filtered by {rule}
                </td>
                <td className="px1 text-centered">
                    <SegmentActionSelect segment={segment}/>
                </td>
            </tr>
        )
    }
}
