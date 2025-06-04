import { t } from "ttag";

import { EmbeddingToggle } from "metabase/admin/settings/components/EmbeddingSettings/EmbeddingToggle";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import Breadcrumbs from "metabase/common/components/Breadcrumbs";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box, Button, Stack } from "metabase/ui";

import { EmbeddingAppOriginDescription } from "./EmbeddingAppOriginDescription";
import { SameSiteSelectWidget } from "./EmbeddingAppSameSiteCookieDescription";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-interactive-admin",
};

export function InteractiveEmbeddingSettings() {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- This is used in admin settings
  const { url: quickStartUrl } = useDocsUrl(
    "embedding/interactive-embedding-quick-start-guide",
    {
      utm: utmTags,
    },
  );

  return (
    <Box p="0.5rem 1rem 0" maw="40rem">
      <Stack gap="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Interactive embedding`],
          ]}
        />
        <EmbeddingToggle
          settingKey="enable-embedding-interactive"
          label={t`Enable Interactive embedding`}
        />

        <Box>
          <SettingHeader id="get-started" title={t`Get started`} />
          <Button
            variant="outline"
            component={ExternalLink}
            href={quickStartUrl}
          >{t`Check out the Quickstart`}</Button>
        </Box>

        <AdminSettingInput
          name="embedding-app-origins-interactive"
          title={t`Authorized origins`}
          description={<EmbeddingAppOriginDescription />}
          placeholder="https://*.example.com"
          inputType="text"
        />

        <SameSiteSelectWidget />
      </Stack>
    </Box>
  );
}
