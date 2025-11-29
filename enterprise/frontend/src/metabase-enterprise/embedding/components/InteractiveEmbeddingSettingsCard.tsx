import cx from "classnames";
import { c, t } from "ttag";

import { EmbeddingSettingsCard } from "metabase/admin/settings/components/EmbeddingSettings";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Stack } from "metabase/ui/components";
import { InteractiveEmbeddingAuthorizedOriginsWidget } from "metabase-enterprise/embedding/components/InteractiveEmbeddingAuthorizedOriginsWidget";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-interactive-admin",
};

export function InteractiveEmbeddingSettingsCard() {
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );

  const { url: quickStartUrl } = useDocsUrl(
    "embedding/interactive-embedding-quick-start-guide",
    {
      utm: utmTags,
    },
  );

  return (
    <EmbeddingSettingsCard
      title={t`Enable legacy interactive embedding`}
      description={t`A way to embed the entire Metabase app in an iframe. It integrates your permissions and SSO to give people the right level ofaccess to query and drill-down into your data.`}
      settingKey="enable-embedding-interactive"
      alertInfoText={c(
        "{0} is the link to switch binaries. {1} is the link to upsell the SDK. {2} is the link to implement JWT or SAML authentication.",
      )
        .jt`The new embedding methods give you more flexibility. Interactive embedding and Static embedding will be deprecated in a future version of Metabase. ${(
        <ExternalLink
          key="migration-guide-from-legacy-embedding"
          href={quickStartUrl}
          className={cx(CS.link, CS.textBold)}
        >
          {t`Read more`}
        </ExternalLink>
      )}.`}
    >
      {isInteractiveEmbeddingEnabled && (
        <Stack gap="xl" px="xl" pb="lg">
          <InteractiveEmbeddingAuthorizedOriginsWidget />
        </Stack>
      )}
    </EmbeddingSettingsCard>
  );
}
