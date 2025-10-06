import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { Text } from "metabase/ui";

import { HelpLinkSettings } from "./HelpLinkSettings";
import { IllustrationWidget } from "./IllustrationWidget";
import { MetabaseLinksToggleDescription } from "./MetabaseLinksToggleDescription";
import { MetabotToggleWidget } from "./MetabotToggleWidget";

export function WhiteLabelConcealSettingsPage() {
  return (
    <SettingsPageWrapper
      data-testid="conceal-metabase-settings"
      title={t`Conceal Metabase`}
      description={t`Configure your instance to conceal references to Metabase and customize illustrations.`}
    >
      <SettingsSection title={t`Names`}>
        <AdminSettingInput
          name="application-name"
          title={t`Application name`}
          inputType="text"
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

        <HelpLinkSettings />
      </SettingsSection>

      <SettingsSection
        title={t`Metabase illustrations`}
        description={t`Customize each of the illustrations in Metabase`}
      >
        <MetabotToggleWidget />

        <IllustrationWidget
          name="login-page-illustration"
          title={t`Login and unsubscribe pages`}
        />
        <IllustrationWidget
          name="landing-page-illustration"
          title={t`Landing page`}
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
    </SettingsPageWrapper>
  );
}
