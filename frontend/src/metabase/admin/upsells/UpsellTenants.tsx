import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

export const UpsellTenants = ({
  align = "center",
  source: location = "people-tenants",
}: {
  align?: "center" | "flex-start";
  source?: string;
}) => {
  const hasTenants = useHasTokenFeature("tenants");
  const campaign = "tenants";
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  if (hasTenants) {
    return null;
  }

  return (
    <DottedBackground px={align === "flex-start" ? 0 : "3.5rem"} py="2rem">
      {/* Left-aligned in the embedding hub, where the card lines up with
          the page heading. Admin People keeps the original centered layout. */}
      <Stack align={align}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={t`Use a multi-tenant user strategy`}
            description={t`Securely share data with external users and allow them to create content. Reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            image="app/assets/img/upsell-embedding-tenants.svg"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
