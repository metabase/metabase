import { c, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellCard } from "./components";

export const UpsellBetterSupport = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellCard
      title={t`Get expert help`}
      campaign="better-hosting"
      buttonText={t`Try for free`}
      buttonLink="https://www.metabase.com/upgrade"
      source={source}
    >
      <div>{t`Unlimited support from success engineers whenever you need it with any paid plan.`}</div>
      <div>{c("Reasons why paid support is better.")
        .t`No chatbots, no hold lines, no customer service runaround.`}</div>
    </UpsellCard>
  );
};
