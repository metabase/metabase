import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useDispatch } from "metabase/lib/redux";
import { Box, Stack, Tabs, Text } from "metabase/ui";

import { getLoadingMessageOptions } from "../lib/loading-message";

import { ColorSettingsWidget } from "./ColorSettingsWidget";
import { FontWidget } from "./FontWidget";
import { HelpLinkSettings } from "./HelpLinkSettings";
import { IllustrationWidget } from "./IllustrationWidget";
import { ImageUploadWidget } from "./IllustrationWidget/ImageUploadWidget";
import { MetabaseLinksToggleDescription } from "./MetabaseLinksToggleDescription";
import { MetabotToggleWidget } from "./MetabotToggleWidget";

export function WhiteLabelSettingsPage({
  tab,
}: {
  tab?: "branding" | "conceal-metabase";
}) {
  const dispatch = useDispatch();

  const handleTabChange = (newTab: "branding" | "conceal-metabase") => {
    dispatch(push(`/admin/settings/whitelabel/${newTab}`));
  };

  return (
    <Tabs mx="md" value={tab ?? "branding"} maw="80rem">
      <Tabs.List>
        <Tabs.Tab value="branding" onClick={() => handleTabChange("branding")}>
          {t`Branding`}
        </Tabs.Tab>
        <Tabs.Tab
          value="conceal-metabase"
          onClick={() => handleTabChange("conceal-metabase")}
        >
          {t`Conceal Metabase`}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="branding">
        <BrandingTab />
      </Tabs.Panel>
      <Tabs.Panel value="conceal-metabase">
        <ConcealTab />
      </Tabs.Panel>
    </Tabs>
  );
}

function BrandingTab() {
  return (
    <Stack gap="xl" py="lg" data-testid="branding-settings">
      <Text>
        {t`Configure your instance to match your brand visuals and voice`}
      </Text>

      <Box>
        <Text tt="uppercase" fw="bold" c="text-medium">
          {t`Color Palette`}
        </Text>
        <Text c="text-medium">
          {t`Choose the colors used in the user interface throughout Metabase and others specifically for the charts. You need to refresh your browser to see your changes take effect.`}
        </Text>
      </Box>

      <ColorSettingsWidget />

      <Stack maw="40rem" gap="xl">
        <ImageUploadWidget
          name="application-logo-url"
          title={t`Logo`}
          description={t`For best results, use an SVG file with a transparent
              background.`}
        />
        <FontWidget />
        <AdminSettingInput
          name="loading-message"
          title={t`Loading Message`}
          inputType="select"
          options={getLoadingMessageOptions()}
        />
        <ImageUploadWidget name="application-favicon-url" title={t`Favicon`} />
      </Stack>
    </Stack>
  );
}

function ConcealTab() {
  return (
    <Stack gap="xl" maw="40rem" py="lg" data-testid="conceal-metabase-settings">
      <Text>
        {t`Hide or customize pieces of the Metabase product to tailor the experience to your brand and needs`}
      </Text>

      <AdminSettingInput
        name="application-name"
        title={t`Application Name`}
        inputType="text"
      />

      <AdminSettingInput
        name="show-metabase-links"
        title={t`Documentation and References`}
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

      <Box>
        <Text tt="uppercase" fw="bold" c="text-medium">
          {t`Metabase Illustrations`}
        </Text>
        <Text c="text-medium">
          {t`Customize each of the illustrations in Metabase`}
        </Text>
      </Box>

      <MetabotToggleWidget />

      <IllustrationWidget
        name="login-page-illustration"
        title={t`Login and unsubscribe pages`}
      />
      <IllustrationWidget
        name="landing-page-illustration"
        title={t`Landing Page`}
      />
      <IllustrationWidget
        name="no-data-illustration"
        title={t`When calculations return no results`}
      />
      <IllustrationWidget
        name="no-object-illustration"
        title={t`When no objects can be found`}
      />
    </Stack>
  );
}
