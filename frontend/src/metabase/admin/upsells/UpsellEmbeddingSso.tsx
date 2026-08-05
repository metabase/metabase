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
 * No illustration yet — the design has one (a key and lock) that has not been
 * exported. `UpsellCardContent` renders a narrower text-only card without it,
 * which reads as deliberate rather than broken.
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
    <DottedBackground px="3.5rem" pb="2rem">
      <Stack align="center" p={40}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={source}
            title={t`Secure your embeds with single sign-on`}
            description={t`Connect Metabase to your identity provider using JSON Web Tokens (JWT) to authenticate people to ensure only authorized users can access your embeds.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
