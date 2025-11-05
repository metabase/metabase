import cx from "classnames";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { UpsellSdkLink } from "metabase/admin/upsells/UpsellSdkLink";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl, useUrlWithUtm } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { isEEBuild } from "metabase/lib/utils";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";

import { EmbeddingSettingsCard } from "../EmbeddingSettingsCard";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-sdk",
  utm_content: "embedding-sdk-admin",
};

export const EmbeddingSdkSettings = () => {
  const isEE = isEEBuild();
  const isReactSdkFeatureAvailable = PLUGIN_EMBEDDING_SDK.isEnabled();

  const { url: switchMetabaseBinariesUrl } = useDocsUrl(
    "paid-features/activating-the-enterprise-edition",
    { utm: utmTags },
  );

  const implementJwtUrl = useDocsUrl("embedding/sdk/authentication", {
    utm: utmTags,
  });

  const sdkQuickStartUrl = useUrlWithUtm(
    "https://metaba.se/sdk-quick-start",
    utmTags,
  );

  const sdkDocumentationUrl = useUrlWithUtm(
    "https://metaba.se/sdk-docs",
    utmTags,
  );

  const SwitchBinariesLink = (
    <ExternalLink
      key="switch-metabase-binaries"
      href={switchMetabaseBinariesUrl}
      className={cx(CS.link, CS.textBold)}
    >
      {t`switch Metabase binaries`}
    </ExternalLink>
  );

  const ImplementJwtLink = (
    <ExternalLink
      key="implement-jwt"
      href={implementJwtUrl.url}
      className={cx(CS.link, CS.textBold)}
    >
      {t`implement JWT or SAML SSO`}
    </ExternalLink>
  );

  const apiKeyBannerText = match({
    needsToSwitchBinaries: !isEE,
    needsToUpgrade: !isReactSdkFeatureAvailable,
    needsToImplementJwt: isReactSdkFeatureAvailable,
  })
    .with(
      { needsToSwitchBinaries: true },
      () =>
        c(
          "{0} is the link to switch binaries. {1} is the link to upsell the SDK. {2} is the link to implement JWT or SAML authentication.",
        )
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${SwitchBinariesLink}, ${(<UpsellSdkLink key="upsell-sdk-link" />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToUpgrade: true },
      () =>
        c(
          "{0} is the link to upsell the SDK. {1} is the link to implement JWT or SAML authentication.",
        )
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${(<UpsellSdkLink key="upsell-sdk-link" />)} and ${ImplementJwtLink}.`,
    )
    .with(
      { needsToImplementJwt: true },
      () =>
        c("{0} is the link to implement JWT or SAML authentication.")
          .jt`You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, ${ImplementJwtLink}.`,
    )
    .otherwise(() => null);

  return (
    <EmbeddingSettingsCard
      title={t`Enable SDK for React`}
      description={t`Embed the full power of Metabase into your application to build a custom analytics experience and programmatically manage dashboards and data.`}
      settingKey="enable-embedding-sdk"
      links={[
        {
          icon: "bolt",
          title: t`Quick start`,
          href: sdkQuickStartUrl,
        },
        {
          icon: "reference",
          title: t`Documentation`,
          href: sdkDocumentationUrl,
        },
      ]}
      alertInfoText={apiKeyBannerText}
      testId="sdk-setting-card"
    />
  );
};
