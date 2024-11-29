import type { ComponentPropsWithRef, ReactNode } from "react";

import { Box, Flex, Icon, Text } from "metabase/ui";

const NodeListTitle = ({ children }: { children: ReactNode }) => {
  return (
    <Flex align="center" fw={700} p="0.5rem 0.5rem 0.5rem 6px">
      {children}
    </Flex>
  );
};

const NodeListContainer = ({ children }: { children: ReactNode }) => {
  return (
    <Box component="ul" pt="md">
      {children}
    </Box>
  );
};

const NodeListTitleText = ({ children }: { children: ReactNode }) => {
  return (
    <Text component="span" ml="sm">
      {children}
    </Text>
  );
};

const QuestionId = ({ children }: { children: ReactNode }) => {
  return (
    <Box
      component="span"
      fz="0.75em"
      color="var(--mb-color-text-medium)"
      ml="xs"
    >
      {children}
    </Box>
  );
};

const NodeListItemName = ({ children }: { children: ReactNode }) => {
  return (
    <Text fw={700} ml="sm">
      {children}
    </Text>
  );
};

const NodeListIcon = (props: ComponentPropsWithRef<typeof Icon>) => (
  <Icon mt="1px" w="md" {...props} />
);

export {
  NodeListTitle,
  NodeListContainer,
  NodeListTitleText,
  QuestionId,
  NodeListItemName,
  NodeListIcon,
};
