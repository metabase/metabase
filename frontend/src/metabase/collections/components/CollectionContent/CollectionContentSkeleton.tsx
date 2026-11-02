import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { Box, Flex, Skeleton } from "metabase/ui";

const HEADER_ACTIONS_COUNT = 4;
const ITEM_ROWS_COUNT = 8;
const ROW_HEIGHT = "3.5rem";

const ItemsTableSkeleton = () => (
  <Box
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="0.5rem"
    bg="background_page-primary"
  >
    <Flex align="center" gap="lg" h="2.75rem" px="md">
      <Skeleton h={10} w="20%" radius="xs" />
      <Skeleton h={10} w="10%" radius="xs" ml="auto" />
      <Skeleton h={10} w="15%" radius="xs" />
    </Flex>
    {Array.from({ length: ITEM_ROWS_COUNT }, (_, index) => (
      <Flex
        key={index}
        align="center"
        gap="lg"
        h={ROW_HEIGHT}
        px="md"
        style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Flex align="center" gap="md" flex={1} miw={0}>
          <Skeleton h={16} w={16} radius="xs" flex="none" />
          <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
        </Flex>
        <Skeleton h={12} w="10%" radius="xs" />
        <Skeleton h={12} w="15%" radius="xs" />
      </Flex>
    ))}
  </Box>
);

/** The collection page while the collection and its items load. */
export const CollectionContentSkeleton = () => (
  <Box h="100%" bg="background_page-secondary">
    <LoadingSkeleton gap={0} mx="auto" px="5%" py="lg">
      <Flex
        justify="space-between"
        align="center"
        mb="xxl"
        pt={{ base: "xxs", sm: "sm" }}
      >
        <Skeleton h={28} w={240} radius="xs" />
        <Flex gap="sm">
          {Array.from({ length: HEADER_ACTIONS_COUNT }, (_, index) => (
            <Skeleton key={index} h={32} w={32} radius="sm" />
          ))}
        </Flex>
      </Flex>
      <ItemsTableSkeleton />
    </LoadingSkeleton>
  </Box>
);
