import Settings from "metabase/lib/settings";

export const getSSOUrl = (redirectUrl?: string): string => {
  const siteUrl = Settings.get("site-url");

  if (redirectUrl) {
    return `${siteUrl}/auth/sso?redirect=${encodeURIComponent(redirectUrl)}`;
  } else {
    return `${siteUrl}/auth/sso`;
  }
};
