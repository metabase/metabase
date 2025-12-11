import { c, t } from "ttag";

import { UpsellCard } from "metabase/common/components/UpsellCard";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UPGRADE_URL } from "./constants";

export const UpsellUploads = ({ location }: { location: string }) => {
  const campaign = "manage-uploads";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });
  const plan = getPlan(useSetting("token-features"));

  const showUpsell = plan === "oss" || plan === "starter";

  if (!showUpsell) {
    return null;
  }

  const upgrade = (
    <strong key="upgrade">{c(
      "in the sentence 'Upgrade to Metabase Pro to manage your uploaded files and available storage space.'",
    ).t`Upgrade to Metabase Pro`}</strong>
  );

  return (
    <UpsellCard
      title={t`Manage your uploads`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      onClick={triggerUpsellFlow}
    >
      {c("{0} is the string 'Upgrade to Metabase Pro'").jt`${upgrade}
       to manage your uploaded files and available storage space.`}
    </UpsellCard>
  );
};
