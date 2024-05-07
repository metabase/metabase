export const getSSOUrl = (siteUrl: string, redirectUrl?: string): string => {
  if (redirectUrl) {
    return `${siteUrl}/auth/sso?redirect=${encodeURIComponent(redirectUrl)}`;
  }
  return `${siteUrl}/auth/sso`;
};
