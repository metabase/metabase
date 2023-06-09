import { ReactNode } from "react";
import { Flex, Text, Title } from "@mantine/core";
import { Icon, IconName } from "metabase/core/components/Icon";
import { PermissionIconContainer } from "./PermissionHelpDescription.styled";

interface PermissionHelpDescriptionProps {
  name: ReactNode;
  description?: ReactNode;
  icon: IconName;
  iconColor: string;
}

export const PermissionHelpDescription = ({
  name,
  description,
  icon,
  iconColor,
}: PermissionHelpDescriptionProps) => (
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
  </div>
);
