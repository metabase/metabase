import { Box, Flex, Skeleton, Stack } from "metabase/ui";

import S from "./TableSkeleton.module.css";

const SKELETON_ROWS_COUNT = 8;

export function TableSkeleton() {
  return (
    <Box
      flex={1}
      mih={0}
      bd="1px solid var(--mb-color-border)"
      bg="bg-white"
      className={S.container}
    >
      <Stack gap={0}>
        <Flex h={36} px="md" align="center" gap="xl">
          <Skeleton h={14} w="15%" />
          <Skeleton h={14} w="12%" />
          <Skeleton h={14} w="10%" />
          <Skeleton h={14} w="8%" />
        </Flex>
        {Array.from({ length: SKELETON_ROWS_COUNT }).map((_, i) => (
          <Flex
            key={i}
            h={48}
            px="md"
            align="center"
            gap="xl"
            className={S.row}
          >
            <Skeleton h={14} natural />
            <Skeleton h={14} natural />
            <Skeleton h={14} natural />
            <Skeleton h={14} natural />
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
