import { c, t } from "ttag";

import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import { SettingsSection } from "metabase/settings-components/SettingsSection";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { IllustrationWidget } from "./IllustrationWidget";

/**
 * The whitelabel settings that show up *inside* an embed: the loading message
 * and the two empty-state illustrations. Excludes logo, favicon, the login
 * and landing illustrations, `show-metabase-links`, and instance colours,
 * fonts and application name -- the theme editor on the same tab covers those.
 *
 * Registered through a plugin slot rather than imported: everything here is
 * EE-only, and `frontend/src/metabase/**` may not import `metabase-enterprise*`.
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
