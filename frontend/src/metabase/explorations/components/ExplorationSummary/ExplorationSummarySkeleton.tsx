import { Box, Skeleton, Stack } from "metabase/ui";

const SKELETON_LINE_WIDTHS = [
  "100%",
  "94%",
  "98%",
  "62%",
  "100%",
  "91%",
  "96%",
  "88%",
  "47%",
];

export function ExplorationSummarySkeleton() {
  return (
    <Stack
      data-testid="exploration-summary-skeleton"
      flex={1}
      h="100%"
      py="3rem"
      pr="3rem"
      align="center"
      style={{ overflowY: "auto" }}
    >
      <Stack
        flex={1}
        w="100%"
        bg="background-primary"
        bd="1px solid border"
        bdrs="sm"
        p="xl"
        gap={0}
      >
        <Box h="2.5rem" w="100%" maw="42.5rem" mx="auto">
          <Skeleton h="1.5rem" w="45%" radius="xs" />
        </Box>
        <Stack w="100%" maw="42.5rem" mx="auto" mt="xl" gap="lg">
          {SKELETON_LINE_WIDTHS.map((width, index) => (
            <Skeleton key={index} h="0.75rem" w={width} radius="xs" />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}
