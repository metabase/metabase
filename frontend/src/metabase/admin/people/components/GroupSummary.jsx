/* eslint-disable react/prop-types */
import { t, ngettext, msgid } from "ttag";

import CS from "metabase/css/core/index.css";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";

import { AdminGroupLabel } from "./GroupSummary.styled";

const GroupSummary = ({ groups, selectedGroupIds }) => {
  const adminGroup = groups.find(isAdminGroup);
  const otherGroups = groups.filter(
    g =>
      selectedGroupIds.includes(g.id) && !isAdminGroup(g) && !isDefaultGroup(g),
  );
  if (adminGroup && selectedGroupIds.includes(adminGroup.id)) {
    return (
      <span>
        <AdminGroupLabel>{t`Admin`}</AdminGroupLabel>
        {otherGroups.length > 0 && " " + t`and` + " "}
        {otherGroups.length > 0 && (
          <span className={CS.textBrand}>
            {(n => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
              otherGroups.length,
            )}
          </span>
        )}
      </span>
    );
  } else if (otherGroups.length === 1) {
    return <span className={CS.textBrand}>{otherGroups[0].name}</span>;
  } else if (otherGroups.length > 1) {
    return (
      <span className={CS.textBrand}>
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
