import { t } from "ttag";

import { SettingsSection } from "metabase/admin/settings/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { Box, Stack, Text, Title } from "metabase/ui";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { ColorSettingsWidget } from "./ColorSettingsWidget";
import { FontWidget } from "./FontWidget";
import { ImageUploadWidget } from "./IllustrationWidget/ImageUploadWidget";

export function WhiteLabelBrandingSettingsPage() {
  return (
    <Stack gap="xl" py="lg" data-testid="branding-settings" maw="50rem">
      <Box>
        <Title order={1} pb="xs">{t`Branding`}</Title>
        <Text c="text-medium" mb="md">
          {t`Configure your instance to match your brand visuals and voice`}
        </Text>
      </Box>

      <SettingsSection title={t`Colors`}>
        <Box>
          <Text tt="uppercase" fw="bold" c="text-medium">
            {t`Color Palette`}
          </Text>
          <Text c="text-medium">
            {t`Choose the colors used in the user interface throughout Metabase and others specifically for the charts. You need to refresh your browser to see your changes take effect.`}
          </Text>
        </Box>

        <ColorSettingsWidget />
      </SettingsSection>

      <SettingsSection title={t`Icons`}>
        <ImageUploadWidget
          name="application-logo-url"
          title={t`Logo`}
          description={t`For best results, use an SVG file with a transparent
            background.`}
        />
        <ImageUploadWidget name="application-favicon-url" title={t`Favicon`} />
      </SettingsSection>

      <SettingsSection title={t`Fonts`}>
        <FontWidget />
      </SettingsSection>

      <SettingsSection>
        <AdminSettingInput
          name="loading-message"
          title={t`Loading Message`}
          inputType="select"
          options={getLoadingMessageOptions()}
        />
      </SettingsSection>
    </Stack>
  );
}
