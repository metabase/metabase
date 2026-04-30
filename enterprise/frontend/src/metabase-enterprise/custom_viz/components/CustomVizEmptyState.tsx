import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useAdminSetting } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Card,
  Group,
  Icon,
  type IconName,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";

const CUSTOM_VIZ_ENABLED_SETTING = "custom-viz-enabled";

export function CustomVizEmptyState() {
  const { updateSetting } = useAdminSetting(CUSTOM_VIZ_ENABLED_SETTING);
  const { sendErrorToast } = useMetadataToasts();

  const handleEnable = async () => {
    const { error } = await updateSetting({
      key: CUSTOM_VIZ_ENABLED_SETTING,
      value: true,
      toast: false,
    });

    if (error) {
      sendErrorToast(t`Failed to enable custom visualizations`);
    } else {
      window.location.reload();
    }
  };

  return (
    <SettingsPageWrapper title={t`Custom visualizations`}>
      <Card bg="background-primary" p={48} maw={640} withBorder>
        <Stack gap="3rem">
          <Stack gap="md">
            <Stack gap="sm">
              <Title order={3}>{t`Enable custom visualizations`}</Title>
              <Text c="text-secondary" lh="1.25rem">
                {t`Show your data the way you need to with custom visualizations. Use the custom viz SDK to build visualization plugins and link them here from a Git repository.`}
              </Text>
              <Text fw="bold" lh="1.25rem">
                {t`Be aware that custom visualizations can execute arbitrary code, and should only be added from trusted sources.`}
              </Text>
            </Stack>
            <Group gap="sm">
              <Button variant="filled" onClick={handleEnable}>
                {t`Enable custom visualizations`}
              </Button>
            </Group>
          </Stack>
          <SimpleGrid cols={2} spacing="sm">
            <FeatureCard
              icon="lineandbar"
              title={t`Custom chart types`}
              description={t`Create visualization types designed for your specific data and use cases`}
            />
            <FeatureCard
              icon="code_block"
              title={t`SDK-based development`}
              description={t`Build plugins with the Custom Visualizations SDK`}
            />
            <FeatureCard
              icon="git_branch"
              title={t`Git-based distribution`}
              description={t`Publish custom visualizations by linking to a Git repository`}
            />
            <FeatureCard
              icon="gear"
              title={t`Full control`}
              description={t`Enable, disable, and manage custom visualization plugins`}
            />
          </SimpleGrid>
        </Stack>
      </Card>
    </SettingsPageWrapper>
  );
}

type FeatureCardProps = {
  icon: IconName;
  title: string;
  description: string;
};

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Paper bg="background-secondary" p="md" radius="md" shadow="none">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name={icon} size={16} c="brand" style={{ flexShrink: 0 }} />
        <Stack gap="xs">
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
