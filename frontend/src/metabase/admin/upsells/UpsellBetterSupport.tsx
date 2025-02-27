import { c, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

import { UpsellCard } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellBetterSupport = ({ source }: { source: string }) => {
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  if (plan !== "oss") {
    return null;
  }

  return (
    <UpsellCard
      title={t`Get expert help`}
      campaign="better-hosting"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
    >
      <div>{t`Unlimited support from success engineers whenever you need it with any paid plan.`}</div>
      <div>{c("Reasons why paid support is better.")
        .t`No chatbots, no hold lines, no customer service runaround.`}</div>
    </UpsellCard>
  );
};
