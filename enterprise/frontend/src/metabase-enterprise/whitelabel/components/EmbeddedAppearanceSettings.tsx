import { c, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { Text } from "metabase/ui";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { IllustrationWidget } from "./IllustrationWidget";
import { MetabaseLinksToggleDescription } from "./MetabaseLinksToggleDescription";

/**
 * The whitelabel appearance settings that show up *inside* an embed, for the
 * embedding hub's Appearance tab. Logo, favicon and the login/landing
 * illustrations belong to Metabase's own interface and are deliberately left
 * out; so are the instance colours, fonts and application name, which the
 * theme editor on the same tab already covers.
 *
 * Registered through a plugin slot rather than imported: every helper here
 * (IllustrationWidget, MetabaseLinksToggleDescription, getLoadingMessageOptions)
 * is EE-only, and nothing under `frontend/src/metabase/**` may import
 * `metabase-enterprise*`.
 */
export function EmbeddedAppearanceSettings() {
  return (
    <>
      <SettingsSection title={t`Messages`}>
        <AdminSettingInput
          name="loading-message"
          title={c(
            "Label for a setting that selects the message shown to users while Metabase is loading",
          ).t`Loading message`}
          inputType="select"
          options={getLoadingMessageOptions()}
        />

        <AdminSettingInput
          name="show-metabase-links"
          title={t`Documentation and references`}
          switchLabel={
            <Text size="md">
              {t`Show links and references to Metabase` + " "}
              <MetabaseLinksToggleDescription />
            </Text>
          }
          description={t`Control the display of Metabase documentation and Metabase references in your instance.`}
          inputType="boolean"
        />
      </SettingsSection>

      <SettingsSection title={t`Illustrations`}>
        <IllustrationWidget
          name="no-data-illustration"
          title={t`When calculations return no results`}
        />
        <IllustrationWidget
          name="no-object-illustration"
          title={t`When no objects can be found`}
        />
      </SettingsSection>
    </>
  );
}
