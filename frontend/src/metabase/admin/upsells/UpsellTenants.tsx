import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

export const UpsellTenants = () => {
  const hasTenants = useHasTokenFeature("tenants");
  const campaign = "tenants";
  const location = "people-tenants";
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  if (hasTenants) {
    return null;
  }

  return (
    <DottedBackground px={0} py="2rem">
      {/* Left-aligned, no extra horizontal padding: the card lines up
          with the page heading, as the design shows. Admin People
          renders this card too and shifts left with it. */}
      <Stack align="flex-start">
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={t`Manage customer-facing analytics at scale`}
            description={t`Group your customers into tenants, reuse the same dashboards and permissions, and keep each tenant's data isolated.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            // 800 per the design; the shared default is 700.
            cardWidth={800}
            variant="image-panel"
            image="app/assets/img/upsell-embedding-tenants.svg"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
