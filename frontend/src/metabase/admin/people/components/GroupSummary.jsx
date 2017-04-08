import React from "react";

import _ from "underscore";

import { inflect } from "metabase/lib/formatting";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

const GroupSummary = ({ groups, selectedGroups }) => {
    let adminGroup = _.find(groups, isAdminGroup);
    let otherGroups = groups.filter(g => selectedGroups[g.id] && !isAdminGroup(g) && !isDefaultGroup(g));
    if (selectedGroups[adminGroup.id]) {
        return (
            <span>
                <span className="text-purple">Admin</span>
                { otherGroups.length > 0 && " and " }
                { otherGroups.length > 0 && <span className="text-brand">{otherGroups.length + " other " + inflect("group", otherGroups.length)}</span> }
            </span>
        );
    } else if (otherGroups.length === 1) {
        return <span className="text-brand">{otherGroups[0].name}</span>;
    } else if (otherGroups.length > 1) {
        return <span className="text-brand">{otherGroups.length + " " + inflect("group", otherGroups.length)}</span>;
    } else {
        return <span>Default</span>;
    }
}

export default GroupSummary;
