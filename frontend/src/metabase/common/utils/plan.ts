import type { TokenFeatures } from "metabase-types/api";
import { tokenFeatures } from "metabase-types/api";

import { useSetting } from "../hooks";

export type ProPlan = "pro-cloud" | "pro-cloud-with-dwh" | "pro-self-hosted";

export type Plan = "oss" | "starter" | "starter-with-dwh" | ProPlan;

export const isProPlan = (plan: Plan): plan is ProPlan =>
  plan.startsWith("pro-");

export const getPlan = (features?: TokenFeatures | null): Plan => {
  if (features) {
    const hasAnyProFeatures = tokenFeatures.some(
      (feature) =>
        feature !== "hosting" &&
        feature !== "attached_dwh" &&
        features[feature],
    );

    if (hasAnyProFeatures) {
      if (features.hosting) {
        return features.attached_dwh ? "pro-cloud-with-dwh" : "pro-cloud";
      } else {
        return "pro-self-hosted";
      }
    }

    if (features.hosting) {
      return features.attached_dwh ? "starter-with-dwh" : "starter";
    }
  }

  return "oss";
};

const ssoFeatures = ["sso_google", "sso_jwt", "sso_ldap", "sso_saml"] as const;
export const hasAnySsoFeature = (features?: TokenFeatures | null): boolean =>
  features != null && ssoFeatures.some((ssoFeature) => features[ssoFeature]);

export const useGetPlan = (): Plan => {
  const features = useSetting("token-features");
  return getPlan(features);
};
