import type { IconName } from "metabase/ui";
import { Center, Flex, Icon, Stack, Text } from "metabase/ui";

interface Props {
  title: string;
  message?: string;
  icon?: IconName;
}

export function EmptyState({ title, message, icon = "table2" }: Props) {
  return (
    <Center h="100%">
      <Stack align="center" gap="md">
        <Flex
          p="lg"
          align="center"
          justify="center"
          bg="bg-medium"
          style={{ borderRadius: "100%" }}
        >
          <Icon name={icon} />
        </Flex>
        <Stack align="center" gap="xs">
          <Text c="text-medium">{title}</Text>
          {message && (
            <Text c="text-light" size="sm">
              {message}
            </Text>
          )}
        </Stack>
      </Stack>
    </Center>
  );
}
