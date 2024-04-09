import type { TokenFeatures } from "metabase-types/api";
import { tokenFeatures } from "metabase-types/api";

export type Plan = "oss" | "starter" | "pro-cloud" | "pro-self-hosted";

export const getPlan = (features?: TokenFeatures | null): Plan => {
  if (!features) {
    return "oss";
  }

  const hasAnyProFeatures = tokenFeatures.some(
    feature => feature !== "hosting" && features[feature],
  );

  if (!hasAnyProFeatures) {
    return features.hosting ? "starter" : "oss";
  }

  return features.hosting ? "pro-cloud" : "pro-self-hosted";
};

const ssoFeatures = ["sso_google", "sso_jwt", "sso_ldap", "sso_saml"] as const;
export const hasAnySsoFeature = (features?: TokenFeatures | null): boolean =>
  features != null && ssoFeatures.some(ssoFeature => features[ssoFeature]);
