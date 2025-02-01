import { t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

import { UpsellBanner } from "./components";

export const UpsellPermissions = ({ source }: { source: string }) => {
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const showUpsell = plan === "oss" || plan === "starter";

  if (!showUpsell) {
    return null;
  }

  return (
    <UpsellBanner
      campaign="advanced-permissions"
      buttonText={t`Try for free`}
      buttonLink="https://www.metabase.com/upgrade"
      source={source}
      title={t`Get advanced permissions`}
    >
      {t`Granular control down to the row- and column-level security. Manage advanced permissions per user group, or even at the database level.`}
    </UpsellBanner>
  );
};
