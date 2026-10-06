import type { ReactNode } from "react";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Box, Flex, Group, Icon } from "metabase/ui";

type EditBarProps = {
  title: string;
  center?: ReactNode;
  buttons: ReactNode;
  admin?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function EditBar({
  title,
  center,
  buttons,
  admin = false,
  className,
  "data-testid": dataTestId,
}: EditBarProps) {
  return (
    <Flex
      component={FullWidthContainer}
      className={className}
      align="center"
      justify="space-between"
      pos="relative"
      py="sm"
      bg={admin ? "accent7" : "core-brand"}
      data-testid={dataTestId ?? "edit-bar"}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <Icon name="pencil" size={12} c="text-primary-inverse" />
        <Box component="span" c="text-primary-inverse" fw="bold">
          {title}
        </Box>
      </Group>
      {center && <div>{center}</div>}
      <Flex gap="md">{buttons}</Flex>
    </Flex>
  );
}
