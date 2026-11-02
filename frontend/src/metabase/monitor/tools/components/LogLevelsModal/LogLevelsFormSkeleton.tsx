import { Flex, Skeleton, Stack } from "metabase/ui";

const INPUT_HEIGHT = 40;
const BUTTON_HEIGHT = 32;
const LABEL_HEIGHT = 12;

/** The log levels form while its presets load. */
export const LogLevelsFormSkeleton = () => (
  <Stack gap={0}>
    <Flex align="flex-end" gap="lg" justify="space-between" mb="lg">
      <Stack gap="sm">
        <Skeleton h={LABEL_HEIGHT} w={160} radius="xs" />
        <Flex gap="lg">
          <Skeleton h={INPUT_HEIGHT} w={80} radius="sm" />
          <Skeleton h={INPUT_HEIGHT} w={140} radius="sm" />
        </Flex>
      </Stack>
      <Skeleton h={BUTTON_HEIGHT} w={130} radius="sm" />
    </Flex>
    <Skeleton h={LABEL_HEIGHT} w={220} radius="xs" mb="sm" />
    <Skeleton h="35vh" mih={200} radius="sm" />
    <Flex align="center" justify="space-between" mt="xxl">
      <Skeleton h={16} w={16} radius="xl" />
      <Flex gap="lg">
        <Skeleton h={BUTTON_HEIGHT} w={160} radius="sm" />
        <Skeleton h={BUTTON_HEIGHT} w={70} radius="sm" />
      </Flex>
    </Flex>
  </Stack>
);
