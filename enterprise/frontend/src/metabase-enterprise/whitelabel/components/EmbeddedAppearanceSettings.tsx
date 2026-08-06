import { c, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { IllustrationWidget } from "./IllustrationWidget";

/**
 * The whitelabel appearance settings that show up *inside* an embed, for the
 * embedding hub's Appearance tab: the loading message and the two empty-state
 * illustrations, in one "Branding elements" card.
 *
 * Deliberately excluded, per the design: logo, favicon, the login and landing
 * illustrations, `show-metabase-links`, and the instance colours, fonts and
 * application name -- the theme editor on the same tab already covers those.
 *
 * Registered through a plugin slot rather than imported: every helper here is
 * EE-only, and nothing under `frontend/src/metabase/**` may import
 * `metabase-enterprise*`.
 */
export function EmbeddedAppearanceSettings() {
  return (
    <SettingsSection>
      <AdminSettingInput
        name="loading-message"
        title={c(
          "Label for a setting that selects the message shown to users while Metabase is loading",
        ).t`Loading message`}
        inputType="select"
        options={getLoadingMessageOptions()}
      />

      <IllustrationWidget
        name="no-data-illustration"
        title={t`When calculations return no results`}
      />

      <IllustrationWidget
        name="no-object-illustration"
        title={t`When no objects can be found`}
      />
    </SettingsSection>
  );
}
