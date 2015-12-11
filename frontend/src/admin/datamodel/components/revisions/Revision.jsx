import React, { Component, PropTypes } from "react";

import UserAvatar from "metabase/components/UserAvatar.jsx"

import moment from "moment";

// TODO: "you" for current user
// TODO: format diffs
// TODO: show different color avatars for users that aren't me

export default class Revision extends Component {
    static propTypes = {
        revision: PropTypes.object.isRequired
    };

    render() {
        const { revision, objectName } = this.props;

        let name = revision.user.common_name;

        let action;
        if (revision.is_creation) {
            action = "created \"" + objectName + "\"";
        } else {
            action = "made some changes";
        }

        return (
            <li className="flex flex-row">
                <div className="flex flex-column align-center mr2">
                    <div className="text-white">
                        <UserAvatar user={revision.user} />
                    </div>
                    <div className="flex-full my1 border-left" style={{borderWidth: 2}} />
                </div>
                <div className="flex-full mt1 mb4">
                    <div className="flex mb1">
                        <span><strong>{name}</strong> {action}</span>
                        <span className="flex-align-right">{moment(revision.timestamp).format("MMMM DD, YYYY")}</span>
                    </div>
                    { revision.message && <p>"{revision.message}"</p> }
                    <div className="bordered rounded mt2 p2" style={{borderWidth: 2}}>
                        <pre className="m1">{JSON.stringify(revision.diff, null, 2)}</pre>
                    </div>
                </div>
            </li>
        );
    }
}
