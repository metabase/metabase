import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

/**
 * The embedding hub's Authentication tab below the paywall.
 *
 * Not `UpsellSSO`: that one is the narrow sidebar card from admin
 * authentication and hardcodes `maxWidth: 242`, so it renders squished as a
 * page-level upsell. This follows the same shape as `UpsellTenants` and
 * `UpsellEmbeddingTheme`, which is what the design shows.
 *
 */
export const UpsellEmbeddingSso = ({ source }: { source: string }) => {
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const campaign = "embedding-sso";

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location: source,
  });

  if (hasSsoJwt) {
    return null;
  }

  return (
    <DottedBackground px={0} py="2rem">
      {/* Left-aligned, no extra horizontal padding: the card lines up
          with the page heading, as the design shows. */}
      <Stack align="flex-start">
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={source}
            title={t`Secure your embeds with single sign-on`}
            description={t`Connect Metabase to your identity provider using JSON Web Tokens (JWT) to authenticate people to ensure only authorized users can access your embeds.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            variant="image-panel"
            image="app/assets/img/upsell-embedding-sso.svg"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
