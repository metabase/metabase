import { Flex, Skeleton, Stack, Text } from "metabase/ui";

const VALUE_WIDTHS = [48, 180, 72, 120, 96, 140, 110, 64];

/**
 * The bold-label and value rows of the task and run detail pages, with the
 * real labels and skeleton values.
 */
export const DetailRowsSkeleton = ({
  labels,
}: {
  labels: readonly string[];
}) => (
  <Stack gap="sm">
    {labels.map((label, index) => (
      <Flex key={label} gap="lg" align="center">
        <Text fw="bold" w={120}>
          {label}
        </Text>
        <Skeleton
          h={12}
          w={VALUE_WIDTHS[index % VALUE_WIDTHS.length]}
          radius="xs"
        />
      </Flex>
    ))}
  </Stack>
);
