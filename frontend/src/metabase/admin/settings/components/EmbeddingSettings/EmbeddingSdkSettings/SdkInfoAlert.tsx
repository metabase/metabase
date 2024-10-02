import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Alert, Icon, Text } from "metabase/ui";

import { useEmbeddingSettingsLinks } from "./sdk";

const getInfoText = (value: ReactNode) => {
  return jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${value}`;
};

export const SdkInfoAlert = () => {
  const { implementJwtUrl, switchMetabaseBinariesUrl, upgradeUrl } =
    useEmbeddingSettingsLinks();

  const upgradeLink = (
    <ExternalLink href={upgradeUrl}>{t`upgrade to Metabase Pro`}</ExternalLink>
  );
  const jwtLink = (
    <ExternalLink href={implementJwtUrl}>{t`implement JWT SSO`}</ExternalLink>
  );

  const switchBinariesLink = (
    <ExternalLink href={switchMetabaseBinariesUrl}>
      {t`switch Metabase binaries`}
    </ExternalLink>
  );

  const alertText = match({
    isEE: PLUGIN_EMBEDDING_SDK.isEnabled(),
    isHosted: useSetting("is-hosted?"),
  })
    // Self-hosted + OSS
    .with({ isEE: false, isHosted: false }, () =>
      getInfoText(
        <>
          {switchBinariesLink}, {upgradeLink} {t`and`} {jwtLink}.
        </>,
      ),
    )
    // Cloud Starter
    .with({ isEE: false, isHosted: true }, () =>
      getInfoText(
        <>
          {upgradeLink} {t`and`} {jwtLink}.
        </>,
      ),
    )
    // Pro/Enterprise on cloud and self-hosted
    .otherwise(() => getInfoText(<>{jwtLink}.</>));

  return (
    <Alert
      icon={<Icon color="var(--mb-color-text-secondary)" name="info_filled" />}
      bg="var(--mb-color-background-info)"
      style={{ borderColor: "var(--mb-color-border)" }}
      variant="outline"
      px="lg"
      py="md"
      maw={620}
    >
      <Text size="sm">{alertText}</Text>
    </Alert>
  );
};
