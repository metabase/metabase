import { Box, Flex, Repeat, Skeleton } from "metabase/ui";

import S from "./EntitityPickerModal.module.css";

export const EntityPickerLoadingSkeleton = () => (
  <Box data-testid="loading-indicator" className={S.loadingSkeleton}>
    <Flex px="2rem" gap="1.5rem" mb="3.5rem">
      <Repeat times={3}>
        <Skeleton h="2rem" w="5rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" mb="2.5rem" direction="column">
      <Repeat times={2}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" direction="column">
      <Repeat times={3}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
  </Box>
);
