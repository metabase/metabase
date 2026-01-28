import { t } from "ttag";

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
    settings?.["jwt-enabled"];

  return hasAnySsoProviderEnabled;
}

export function useHasAnySsoFeature() {
  const { data: settings } = useGetSettingsQuery();
  const features = settings?.["token-features"];

  return hasAnySsoFeature(features);
}

export function provisioningOptions(
  label: string,
): { label: string; value: string }[] {
  // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
  const trueLabel = t`Enabled: When a user logs in via ${label}, Metabase automatically creates an account for them if they don't have one, or reactivates their existing account.`;
  // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
  const falseLabel = t`Disabled: Only users with active Metabase accounts can log in using ${label}.`;
  return [
    { value: "true", label: trueLabel },
    { value: "false", label: falseLabel },
  ];
}
