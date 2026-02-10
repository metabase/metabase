import { useGetSettingsQuery } from "metabase/api";
import { hasAnySsoFeature } from "metabase/common/utils/plan";

export const getSSOUrl = (siteUrl: string, redirectUrl?: string): string => {
  if (redirectUrl) {
    return `${siteUrl}/auth/sso?redirect=${encodeURIComponent(redirectUrl)}`;
  } else {
    return `${siteUrl}/auth/sso`;
  }
};

export function useHasSsoEnabled() {
  const { data: settings } = useGetSettingsQuery();
  const hasAnySsoProviderEnabled =
    settings?.["google-auth-enabled"] ||
    settings?.["ldap-enabled"] ||
    settings?.["saml-enabled"] ||
    settings?.["jwt-enabled"] ||
    settings?.["oidc-enabled"];

  return hasAnySsoProviderEnabled;
}

export function useHasAnySsoFeature() {
  const { data: settings } = useGetSettingsQuery();
  const features = settings?.["token-features"];

  return hasAnySsoFeature(features);
}
