import { msgid, ngettext, t } from "ttag";

import type { UserGroupType } from "metabase/admin/types";
import CS from "metabase/css/core/index.css";
import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { Box } from "metabase/ui";

interface GroupSummaryProps {
  groups: UserGroupType[];
  selectedGroupIds: number[];
}

export const GroupSummary = ({
  groups,
  selectedGroupIds,
}: GroupSummaryProps) => {
  const adminGroup = groups.find(isAdminGroup);
  const otherGroups = groups.filter(
    (g) =>
      selectedGroupIds.includes(g.id) && !isAdminGroup(g) && !isDefaultGroup(g),
  );

  if (adminGroup && selectedGroupIds.includes(adminGroup.id)) {
    return (
      <span>
        <Box component="span" c="filter">
          {t`Admin`}
        </Box>
        {otherGroups.length > 0 && " " + t`and` + " "}
        {otherGroups.length > 0 && (
          <span className={CS.textBrand}>
            {((n) => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
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
        {((n) => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
          otherGroups.length,
        )}
      </span>
    );
  } else {
    return <span>{t`Default`}</span>;
  }
};
