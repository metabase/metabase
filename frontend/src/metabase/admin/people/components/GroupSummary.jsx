import React from "react";

import { t, ngettext, msgid } from "ttag";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

const GroupSummary = ({ groups, selectedGroupIds }) => {
  const adminGroup = groups.find(isAdminGroup);
  const otherGroups = groups.filter(
    g =>
      selectedGroupIds.includes(g.id) && !isAdminGroup(g) && !isDefaultGroup(g),
  );
  if (adminGroup && selectedGroupIds.includes(adminGroup.id)) {
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
