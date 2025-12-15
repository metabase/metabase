import { msgid, ngettext, t } from "ttag";

import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import { Box, type BoxProps } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

interface GroupSummaryProps extends BoxProps {
  groups: GroupInfo[];
  selectedGroupIds: number[];
}

export const GroupSummary = ({
  groups,
  selectedGroupIds,
  ...props
}: GroupSummaryProps) => {
  const adminGroup = groups.find(isAdminGroup);
  const otherGroups = groups.filter(
    (g) =>
      selectedGroupIds.includes(g.id) && !isAdminGroup(g) && !isDefaultGroup(g),
  );

  if (adminGroup && selectedGroupIds.includes(adminGroup.id)) {
    return (
      <Box component="span" {...props}>
        <Box component="span" c="filter">
          {t`Admin`}
        </Box>
        {otherGroups.length > 0 && " " + t`and` + " "}
        {otherGroups.length > 0 && (
          <Box component="span" c="brand">
            {((n) => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
              otherGroups.length,
            )}
          </Box>
        )}
      </Box>
    );
  } else if (otherGroups.length === 1) {
    return (
      <Box component="span" c="brand" {...props}>
        {otherGroups[0].name}
      </Box>
    );
  } else if (otherGroups.length > 1) {
    return (
      <Box component="span" c="brand" {...props}>
        {((n) => ngettext(msgid`${n} other group`, `${n} other groups`, n))(
          otherGroups.length,
        )}
      </Box>
    );
  } else {
    return <Box {...props}>{t`Default`}</Box>;
  }
};
