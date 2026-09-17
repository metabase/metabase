import { c, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { UserAvatar } from "metabase/common/components/UserAvatar";
import { Group, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { LastEditInfo, UserInfo } from "metabase-types/api";

import { FactCard, FactRow } from "./FactCard";
import { FactSection } from "./FactSection";

export type MaintainerFactProps = {
  creator?: UserInfo;
  createdAt?: string | null;
  lastEditInfo?: LastEditInfo;
};

export function MaintainerFact({
  creator,
  createdAt,
  lastEditInfo,
}: MaintainerFactProps) {
  if (!creator && !lastEditInfo) {
    return null;
  }

  return (
    <FactSection title={t`Maintainer`}>
      <FactCard>
        {creator && (
          <Group gap="sm" wrap="nowrap">
            <UserAvatar user={creator} size="1.5rem" decorative />
            <Text size="sm" truncate>
              {getUserName(creator)}
            </Text>
          </Group>
        )}
        {createdAt && (
          <FactRow icon="ai" muted>
            {c("Describes when an entity was created. {0} is a date.")
              .jt`Created ${<DateTime unit="day" value={createdAt} key="date" />}`}
          </FactRow>
        )}
        {lastEditInfo && (
          <FactRow icon="pencil" muted>
            {c(
              "Describes when an entity was last edited. {0} is a date and {1} is a person's name.",
            ).jt`${(
              <DateTime unit="day" value={lastEditInfo.timestamp} key="date" />
            )} by ${getUserName(lastEditInfo)}`}
          </FactRow>
        )}
      </FactCard>
    </FactSection>
  );
}
