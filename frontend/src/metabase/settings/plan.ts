import {
  type TokenFeature,
  type TokenFeatures,
  tokenFeatures,
} from "metabase-types/api";

export type ProPlan = "pro-cloud" | "pro-cloud-with-dwh" | "pro-self-hosted";

export type Plan = "oss" | "starter" | "starter-with-dwh" | ProPlan;

// Every feature a Starter token can carry; any other enabled feature means Pro.
const STARTER_FEATURES: readonly TokenFeature[] = [
  "hosting",
  "attached_dwh",
  "config_text_file",
  "offer-metabase-ai-managed",
  "support-users",
];

export const isProPlan = (plan: Plan): plan is ProPlan =>
  plan.startsWith("pro-");

export const getPlan = (features?: TokenFeatures | null): Plan => {
  if (features) {
    const hasAnyProFeatures = tokenFeatures.some(
      (feature) => !STARTER_FEATURES.includes(feature) && features[feature],
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
