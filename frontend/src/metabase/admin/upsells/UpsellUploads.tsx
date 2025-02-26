import { c, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

import { UpsellCard } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellUploads = ({ source }: { source: string }) => {
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const showUpsell = plan === "oss" || plan === "starter";

  if (!showUpsell) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Manage your uploads`}
      campaign="manage-uploads"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
    >
      {c("{0} is the string 'Upgrade to Metabase Pro'").jt`${(
        <strong key="upgrade">{t`Upgrade to Metabase Pro`}</strong>
      )} to manage your uploaded files and available storage space.`}
    </UpsellCard>
  );
};
