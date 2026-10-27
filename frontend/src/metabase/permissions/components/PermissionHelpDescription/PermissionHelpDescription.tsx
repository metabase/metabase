import type { ReactNode } from "react";

import { Center, Flex, Icon, Text, Title } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

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
        <Center
          w="1.375rem"
          h="1.375rem"
          bdrs="xxs"
          mr="xs"
          c="text-primary-inverse"
          bg={iconColor}
        >
          <Icon name={icon} />
        </Center>
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
