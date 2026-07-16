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

export function ExplorationDocumentSkeleton() {
  return (
    <Stack
      data-testid="exploration-document-skeleton"
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
        bdrs="md"
        p="lg"
        gap={0}
      >
        <Box h="2.5rem" w="100%" maw="42.5rem" mx="auto">
          <Skeleton h="1.5rem" w="45%" radius="sm" />
        </Box>
        <Stack w="100%" maw="42.5rem" mx="auto" mt="lg" gap="md">
          {SKELETON_LINE_WIDTHS.map((width, index) => (
            <Skeleton key={index} h="0.75rem" w={width} radius="sm" />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}
