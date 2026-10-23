import { Group, Icon, Paper, Stack, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

interface FeatureCardProps {
  icon: IconName;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Paper bg="background_page-secondary" p="lg" radius="8px" shadow="none">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name={icon} size={16} c="core-brand" style={{ flexShrink: 0 }} />
        <Stack gap="xxs">
          <Text fw="bold" lh="1rem">
            {title}
          </Text>
          <Text c="text-secondary" lh="1rem">
            {description}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}
