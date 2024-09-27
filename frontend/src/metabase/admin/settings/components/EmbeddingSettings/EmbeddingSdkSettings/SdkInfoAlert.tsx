import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Alert, Icon, Text } from "metabase/ui";

import { useEmbeddingSettingsLinks } from "./sdk";

export const SdkInfoAlert = () => {
  const { implementJwtUrl, switchMetabaseBinariesUrl, upgradeUrl } =
    useEmbeddingSettingsLinks();
  const isHosted = useSetting("is-hosted?");
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();

  const baseText = t`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, `;
  const upgradeLink = (
    <ExternalLink href={upgradeUrl}>{t`upgrade to Metabase Pro`}</ExternalLink>
  );
  const jwtLink = (
    <ExternalLink href={implementJwtUrl}>{t`implement JWT SSO`}</ExternalLink>
  );

  const alertText = match({ isEE, isHosted })
    .with({ isEE: false, isHosted: false }, () => {
      const switchLink = (
        <ExternalLink
          href={switchMetabaseBinariesUrl}
        >{t`switch Metabase binaries`}</ExternalLink>
      );
      return jt`${baseText}${switchLink}, ${upgradeLink} and ${jwtLink}.`;
    })
    .with(
      { isEE: false, isHosted: true },
      () => jt`${baseText}${upgradeLink} and ${jwtLink}.`,
    )
    .otherwise(() => jt`${baseText}${jwtLink}.`);

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
