import type { ReactNode } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Text, Title } from "metabase/ui";

import { PermissionIconContainer } from "./PermissionHelpDescription.styled";

interface PermissionHelpDescriptionProps {
  name: ReactNode;
  description?: ReactNode;
  icon: IconName;
  iconColor: ColorName;
}

export const PermissionHelpDescription = ({
  name,
  description,
  icon,
  iconColor,
}: PermissionHelpDescriptionProps) => {
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
      {description &&
        (typeof description === "string" ? (
          <Text>{description}</Text>
        ) : (
          description
        ))}
    </div>
  );
};
