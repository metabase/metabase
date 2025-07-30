import { Flex } from "metabase/ui";

import { ComponentPickPlaceholder } from "./ComponentPickPlaceholder";

export function ComponentsEmtpyState() {
  return (
    <Flex w="100%" h="100%" align="center" justify="center">
      <ComponentPickPlaceholder />
    </Flex>
  );
}
