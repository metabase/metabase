import { Center, Icon, type IconName, Stack, Title } from "metabase/ui";

type BenchEmptyStateProps = {
  title: string;
  icon: IconName;
};

export function BenchEmptyState({ title, icon }: BenchEmptyStateProps) {
  return (
    <Center h="100%" bg="bg-light">
      <Stack gap="xl" align="center">
        <Center w="6rem" h="6rem" bg="bg-medium" bdrs="50%">
          <Icon name={icon} c="text-secondary" w="2.5rem" h="2.5rem" />
        </Center>
        <Title order={3} c="text-secondary" ta="center">
          {title}
        </Title>
      </Stack>
    </Center>
  );
}
