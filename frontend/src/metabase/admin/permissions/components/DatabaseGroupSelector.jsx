import React from "react";
import { browserHistory } from "react-router";
import { push } from "react-router-redux";

import { getStore } from 'metabase/store';

function selectGroup(databaseID, groupID) {
    if (groupID === "all") groupID = null;

    const URL = "/admin/permissions/databases/" + databaseID + (groupID ? ("/groups/" + groupID) : "");
    const store = getStore(browserHistory);
    store.dispatch(push(URL));
}

function Selector({ groups, selectedGroupID, databaseID }) {
    if (!selectedGroupID) selectedGroupID = "all";

    return (
        <label className="Select Form-offset">
            <select className="Select"
                    value={selectedGroupID}
                    onChange={(e) => selectGroup(databaseID, e.target.value)}>
                <option value="all">
                    All groups
                </option>
                {groups && groups.map((group, index) =>
                    <option key={index} value={group.id}>
                        {group.name}
                    </option>
                 )}
            </select>
        </label>
    );
}

export default function DatabaseGroupSelector({ groups, selectedGroupID, databaseID }) {
    groups = groups || [];
    return (
        <div className="flex">
            <h3 className="text-grey-4">
                Showing permissions for
            </h3>
            <Selector groups={groups} selectedGroupID={selectedGroupID} databaseID={databaseID} />
        </div>
    );
}
