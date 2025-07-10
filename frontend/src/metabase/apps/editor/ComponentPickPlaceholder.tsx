/* eslint-disable no-color-literals */
import { IconLayersSelected } from "@tabler/icons-react";

import { Flex, Text } from "metabase/ui";

export function ComponentPickPlaceholder() {
  return (
    <Flex
      bg="repeating-linear-gradient( -45deg, var(--mb-color-bg-medium), var(--mb-color-bg-medium) 5px, var(--mb-color-bg-light) 5px, var(--mb-color-bg-light) 25px )"
      p="sm"
      align="center"
      justify="center"
      gap="sm"
      bd="1px dashed var(--mb-color-brand)"
    >
      <IconLayersSelected size={16} color="var(--mb-color-brand)" />
      <Text c="var(--mb-color-brand">{"Component Placeholder"}</Text>
    </Flex>
  );
}
