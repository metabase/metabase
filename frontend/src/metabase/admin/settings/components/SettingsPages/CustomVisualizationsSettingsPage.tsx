import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { UpsellCustomViz } from "metabase/admin/upsells";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import {
  Alert,
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

export function CustomVisualizationsManagePage() {
  const customVizLoaded = useHasTokenFeature("custom-viz");
  const customVizAvailable = useHasTokenFeature("custom-viz-available");

  useCustomVizEnabledSetting();

  if (!customVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizLoaded) {
    return <CustomVizEmptyState />;
  }

  return <PLUGIN_CUSTOM_VIZ.ManageCustomVizPage />;
}

export function CustomVisualizationsFormPage({
  params,
}: {
  params?: { id?: string };
}) {
  const customVizFeatureLoaded = useHasTokenFeature("custom-viz");
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  useCustomVizEnabledSetting();

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizFeatureLoaded) {
    return <CustomVizEmptyState />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizPage params={params} />;
}

export function CustomVisualizationsDevelopmentPage() {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  const customVizFeatureLoaded = useHasTokenFeature("custom-viz");
  useCustomVizEnabledSetting();

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizFeatureLoaded) {
    return <CustomVizEmptyState />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizDevPage />;
}

const CUSTOM_VIZ_ENABLED_SETTING = "custom-viz-enabled";

function CustomVizEmptyState() {
  const { updateSetting, updateSettingResult } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );

  const handleEnable = () => {
    updateSetting({
      key: CUSTOM_VIZ_ENABLED_SETTING,
      value: true,
      toast: false,
    });
  };

  return (
    <SettingsPageWrapper title={t`Custom visualizations`}>
      <Card bg="background-primary" p={48} maw={640} withBorder>
        <Stack gap="3rem">
          <Stack gap="md">
            <Stack gap="sm">
              <Title order={3}>{t`Build custom visualizations`}</Title>
              <Text c="text-secondary" lh="1.25rem">
                {t`Extend Metabase with chart types tailored to your data. Build visualization plugins using the Custom Viz SDK and link them from a Git repository.`}
              </Text>

              <Text c="text-secondary" maw="40rem"></Text>
              <Alert
                color="warning"
                icon={<Icon name="warning" />}
                title="Risks"
              >{t`Be aware that custom visualizations can execute arbitrary code and should only be added from trusted sources.`}</Alert>
            </Stack>
            <Group gap="sm">
              <Button
                variant="filled"
                onClick={handleEnable}
                loading={updateSettingResult.isLoading}
              >
                {t`Enable Custom Visualizations`}
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
    <Paper bg="background-secondary" p="md" radius="8px" shadow="none">
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

export function CustomVizEnableSwitch() {
  const { value: customVizEnabledSetting } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );

  const description = customVizEnabledSetting
    ? t`Should custom visualizations be enabled for this instance? Disabling this will reload the page.`
    : t`Should custom visualizations be enabled for this instance? Enabling this will reload the page.`;

  return (
    <AdminSettingInput
      name={CUSTOM_VIZ_ENABLED_SETTING}
      title={t`Enable Custom Visualizations`}
      inputType="boolean"
      description={description}
    />
  );
}

function useCustomVizEnabledSetting() {
  const { value: customVizEnabledSetting } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );
  const customVizEnabledSettingPrev = usePrevious(customVizEnabledSetting);

  useEffect(() => {
    if (
      customVizEnabledSettingPrev === undefined ||
      customVizEnabledSetting === undefined
    ) {
      return;
    }

    if (customVizEnabledSetting !== customVizEnabledSettingPrev) {
      setTimeout(() => {
        window.location.reload();
        // timeout helps to render the UI consistently when toggling feature
      }, 1000);
    }
  }, [customVizEnabledSetting, customVizEnabledSettingPrev]);
}
