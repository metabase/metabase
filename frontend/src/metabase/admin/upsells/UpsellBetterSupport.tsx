import { c, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Text } from "metabase/ui";

import { UpsellBanner } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellBetterSupport = ({ location }: { location: string }) => {
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  if (plan !== "oss") {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Get expert help`}
      campaign="better-hosting"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
    >
      <Text size="sm">
        {t`Unlimited support from success engineers whenever you need it with any paid plan.`}{" "}
        {c("Reasons why paid support is better.")
          .t`No chatbots, no hold lines, no customer service runaround.`}
      </Text>
    </UpsellBanner>
  );
};
