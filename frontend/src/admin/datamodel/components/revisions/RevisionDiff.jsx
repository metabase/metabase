import React, { Component, PropTypes } from "react";

import TextDiff from "./TextDiff.jsx";
import QueryDiff from "./QueryDiff.jsx";

import Icon from "metabase/components/Icon.jsx";

export default class RevisionDiff extends Component {
    static propTypes = {
        property: PropTypes.string.isRequired,
        diff: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    render() {
        let { diff: { before, after }, tableMetadata} = this.props;

        let icon;
        if (before != null && after != null) {
            icon = <Icon name="pencil" className="text-brand" width={16} height={16} />
        } else if (before != null) {
            icon = <Icon name="add" className="text-error" width={16} height={16} />
        } else {
            // TODO: "minus" icon
            icon = <Icon name="add" className="text-green" width={16} height={16} />
        }

        return (
            <div className="bordered rounded  my2 flex flex-row align-center" style={{borderWidth: 2}}>
                <div className="m3">
                    {icon}
                </div>
                <div>
                    { this.props.property === "definition" ?
                        <QueryDiff diff={this.props.diff} tableMetadata={tableMetadata}/>
                    :
                        <TextDiff diff={this.props.diff}/>
                    }
                </div>
            </div>
        );
    }
}
