import { jt, t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellCustomViz } from "metabase/admin/upsells";
import { useAdminSetting } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import {
  Alert,
  Button,
  Card,
  Group,
  Icon,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";
export function CustomVisualizationsManagePage() {
  const customVizLoaded = useHasTokenFeature("custom-viz");
  const customVizAvailable = useHasTokenFeature("custom-viz-available");

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
const CSP_IMG_ENABLED_SETTING = "csp-img-enabled";

function CustomVizEmptyState() {
  const { updateSetting } = useAdminSetting(CUSTOM_VIZ_ENABLED_SETTING);
  const { value: cspImgEnabled } = useAdminSetting(CSP_IMG_ENABLED_SETTING);
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
      <Card bg="background_page-primary" p={48} maw={640} withBorder>
        <Stack gap="3rem">
          <Stack gap="md">
            <Stack gap="sm">
              <Title order={3}>{t`Enable custom visualizations`}</Title>
              <Text c="text-secondary" lh="1.25rem">
                {t`Show your data the way you need to with custom visualizations. Use the custom viz SDK to build visualization plugins and upload them here as packaged bundles (.tgz).`}
              </Text>
              <Alert title={t`Security risk`} icon={<Icon name="warning" />}>
                {t`Be aware that custom visualizations can execute arbitrary code, and should only be added from trusted sources.`}
              </Alert>

              {!cspImgEnabled && (
                <Text c="text-secondary" lh="1.25rem">
                  {jt`Turn on "Restrict image domains" in ${(
                    <Link
                      key="link"
                      to={Urls.generalSettings()}
                      variant="brand"
                    >
                      {t`General settings`}
                    </Link>
                  )} before enabling custom visualizations.`}
                </Text>
              )}
            </Stack>
            <Stack align="flex-start">
              <Button
                variant="filled"
                onClick={handleEnable}
                disabled={!cspImgEnabled}
              >
                {t`Enable custom visualizations`}
              </Button>
            </Stack>
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
              icon="upload"
              title={t`Bundle uploads`}
              description={t`Publish custom visualizations by uploading packaged plugin bundles (.tgz)`}
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
    <Paper bg="background_page-secondary" p="md" radius="md" shadow="none">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name={icon} size={16} c="core-brand" style={{ flexShrink: 0 }} />
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
