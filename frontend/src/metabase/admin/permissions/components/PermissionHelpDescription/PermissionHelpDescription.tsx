import { ReactNode } from "react";
import { t } from "ttag";
import { Icon, IconName } from "metabase/core/components/Icon";
import { Flex, Text, Title } from "metabase/ui";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import { getLimitedPermissionAvailabilityMessage } from "metabase/admin/permissions/constants/messages";
import { PermissionIconContainer } from "./PermissionHelpDescription.styled";

interface PermissionHelpDescriptionProps {
  name: ReactNode;
  description?: ReactNode;
  icon: IconName;
  iconColor: string;
  isEnterpriseFeature?: boolean;
}

export const PermissionHelpDescription = ({
  name,
  description,
  icon,
  iconColor,
  isEnterpriseFeature,
}: PermissionHelpDescriptionProps) => {
  const isEnterpriseInstance = MetabaseSettings.isEnterprise();

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

      {isEnterpriseFeature && !isEnterpriseInstance ? (
        <>
          <Text mt="1rem">{getLimitedPermissionAvailabilityMessage()}</Text>{" "}
          <Text weight="bold">
            <ExternalLink href={MetabaseSettings.pricingUrl()}>
              {t`Upgrade to Pro`}
            </ExternalLink>
          </Text>
        </>
      ) : null}
    </div>
  );
};
