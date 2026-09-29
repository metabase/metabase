import { t } from "ttag";

import { UserAvatar } from "metabase/common/components/UserAvatar";
import { Avatar, Ellipsified, Flex, Icon } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Transform } from "metabase-types/api";

export const TransformOwnerAvatar = ({
  transform,
}: {
  transform: Pick<Transform, "owner" | "owner_email">;
}) => {
  const owner = transform.owner;
  const hasUserName = owner?.first_name || owner?.last_name;

  if (hasUserName) {
    const displayName = getUserName(owner) ?? "";
    return (
      <Flex align="center" gap="sm">
        <UserAvatar user={{ common_name: displayName }} size="sm" decorative />
        <Ellipsified>{displayName}</Ellipsified>
      </Flex>
    );
  }

  const ownerEmail = transform.owner_email ?? owner?.email;
  if (ownerEmail) {
    return (
      <Flex align="center" gap="sm">
        <Avatar size="sm" color="initials" name="emails">
          <Icon name="mail" />
        </Avatar>
        <Ellipsified>{ownerEmail}</Ellipsified>
      </Flex>
    );
  }

  return (
    <Flex align="center" gap="sm">
      <Avatar size="sm" color="background_page-secondary" name="unknown">
        <Icon name="person" c="text-secondary" />
      </Avatar>
      <Ellipsified c="text-secondary">{t`No owner`}</Ellipsified>
    </Flex>
  );
};
