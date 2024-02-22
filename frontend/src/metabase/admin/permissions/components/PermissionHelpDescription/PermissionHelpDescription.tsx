import type { ReactNode } from "react";
import { t } from "ttag";

import { getLimitedPermissionAvailabilityMessage } from "metabase/admin/permissions/constants/messages";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import type { IconName } from "metabase/ui";
import { Icon, Flex, Text, Title } from "metabase/ui";

import { PermissionIconContainer } from "./PermissionHelpDescription.styled";

interface PermissionHelpDescriptionProps {
  name: ReactNode;
  description?: ReactNode;
  icon: IconName;
  iconColor: string;
  hasUpgradeNotice?: boolean;
}

export const PermissionHelpDescription = ({
  name,
  description,
  icon,
  iconColor,
  hasUpgradeNotice,
}: PermissionHelpDescriptionProps) => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "admin_permissions" }),
  );

  return (
    <div>
      <Flex align="center" mb={4}>
        <PermissionIconContainer color={iconColor}>
          <Icon name={icon} />
        </PermissionIconContainer>
        <Title order={6} mt={0}>
          {name}
        </Title>
      </Flex>
      {description && <Text>{description}</Text>}

      {hasUpgradeNotice ? (
        <>
          <Text mt="1rem">{getLimitedPermissionAvailabilityMessage()}</Text>{" "}
          <Text weight="bold">
            <ExternalLink href={upgradeUrl}>{t`Upgrade to Pro`}</ExternalLink>
          </Text>
        </>
      ) : null}
    </div>
  );
};
