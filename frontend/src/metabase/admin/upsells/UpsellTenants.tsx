import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

type UpsellTenantsProps = {
  title: string;
  description: string;
  campaign: string;
  illustrationSrc: string;
  location: string;
};

const UpsellTenants = ({
  title,
  description,
  campaign,
  illustrationSrc,
  location,
}: UpsellTenantsProps) => {
  const hasTenants = useHasTokenFeature("tenants");
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  if (hasTenants) {
    return null;
  }

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <Stack align="center" p={40}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={title}
            description={description}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            image={illustrationSrc}
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};

export const UpsellTenantsList = () => (
  <UpsellTenants
    title={t`Manage customer-facing analytics at scale`}
    description={t`Group your customers into tenants, reuse the same dashboards and permissions, and keep each tenant's data isolated.`}
    campaign="tenants"
    illustrationSrc="app/assets/img/upsell-themes.png"
    location="people-tenants"
  />
);

export const UpsellTenantGroups = () => (
  <UpsellTenants
    title={t`Manage permissions for each tenant`}
    description={t`Create tenant groups so each customer's users get the right access to embedded analytics.`}
    campaign="tenant-groups"
    illustrationSrc="app/assets/img/upsell-themes.png"
    location="people-tenant-groups"
  />
);

export const UpsellTenantUsers = () => (
  <UpsellTenants
    title={t`Manage users for each tenant`}
    description={t`Add and manage customer users by tenant so every person only sees their own organization's data.`}
    campaign="tenant-users"
    illustrationSrc="app/assets/img/upsell-themes.png"
    location="people-tenant-users"
  />
);
