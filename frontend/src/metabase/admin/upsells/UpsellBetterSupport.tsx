import { c, t } from "ttag";

import { UpsellCard } from "metabase/common/components/upsells/UpsellCard";
import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getPlan, getSetting } from "metabase/settings";
import { Text } from "metabase/ui";

export const UpsellBetterSupport = ({
  location,
  variant = "banner",
}: {
  location: string;
  /** Use "card" in a narrow space, such as an admin sidebar. */
  variant?: "banner" | "card";
}) => {
  const campaign = "better-hosting";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  if (plan !== "oss") {
    return null;
  }

  const title = t`Get expert help`;
  const buttonText = t`Try for free`;
  const description = (
    <Text size="sm">
      {t`Unlimited support from success engineers whenever you need it with any paid plan.`}{" "}
      {c("Reasons why paid support is better.")
        .t`No hold lines, no customer service runaround.`}
    </Text>
  );

  if (variant === "card") {
    return (
      <UpsellCard
        title={title}
        campaign={campaign}
        buttonText={buttonText}
        buttonLink={UPGRADE_URL}
        location={location}
        style={{ maxWidth: 242 }}
        onClick={triggerUpsellFlow}
      >
        {description}
      </UpsellCard>
    );
  }

  return (
    <UpsellBanner
      title={title}
      campaign={campaign}
      buttonText={buttonText}
      buttonLink={UPGRADE_URL}
      location={location}
      onClick={triggerUpsellFlow}
    >
      {description}
    </UpsellBanner>
  );
};
