import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { Box } from "metabase/ui";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { ColorSettingsWidget } from "./ColorSettingsWidget";
import { FontWidget } from "./FontWidget";
import { ImageUploadWidget } from "./IllustrationWidget/ImageUploadWidget";

export function WhiteLabelBrandingSettingsPage() {
  return (
    <SettingsPageWrapper
      title={t`Branding`}
      description={t`Configure your instance to match your brand visuals and voice`}
    >
      <SettingsSection title={t`Colors`}>
        <Box>
          <SettingHeader
            id="color-palette"
            title={t`Color palette`}
            description={t`Choose the colors used in the user interface throughout Metabase and others specifically for the charts. You need to refresh your browser to see your changes take effect.`}
          />
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
          title={t`Loading message`}
          inputType="select"
          options={getLoadingMessageOptions()}
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
