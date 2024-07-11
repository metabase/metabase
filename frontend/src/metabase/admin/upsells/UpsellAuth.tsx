import { t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

import { UpsellCard } from "./components";

export const UpsellAuthFeatures = ({ source }: { source: string }) => {
  // TODO: double check with product on this
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  if (plan !== "oss") {
    return null;
  }

  return (
    <UpsellCard
      title={t`Tired of manually managing people and groups?`}
      campaign="auth-features"
      buttonText={t`Learn more`}
      buttonLink="https://www.metabase.com/cloud"
      source={source}
      style={{ maxWidth: 242 }}
    >
      {t`Get single-sign on (SSO) via SAML, JWT, or SCIM with Metabase Pro`}
    </UpsellCard>
  );
};
