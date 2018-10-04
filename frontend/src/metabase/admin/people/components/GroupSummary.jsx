import React from "react";

import _ from "underscore";
import { t, ngettext, msgid } from "c-3po";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

const GroupSummary = ({ groups, selectedGroups }) => {
  let adminGroup = _.find(groups, isAdminGroup);
  let otherGroups = groups.filter(
    g => selectedGroups[g.id] && !isAdminGroup(g) && !isDefaultGroup(g),
  );
  if (selectedGroups[adminGroup.id]) {
    return (
      <span>
        <span className="text-purple">{t`Admin`}</span>
        {otherGroups.length > 0 && " " + t`and` + " "}
        {otherGroups.length > 0 && (
          <span className="text-brand">
            {(n => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
              otherGroups.length,
            )}
          </span>
        )}
      </span>
    );
  } else if (otherGroups.length === 1) {
    return <span className="text-brand">{otherGroups[0].name}</span>;
  } else if (otherGroups.length > 1) {
    return (
      <span className="text-brand">
        {(n => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
          otherGroups.length,
        )}
      </span>
    );
  } else {
    return <span>{t`Default`}</span>;
  }
};

export default GroupSummary;
