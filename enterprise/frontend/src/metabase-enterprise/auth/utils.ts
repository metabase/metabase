import Settings from "metabase/lib/settings";

export const getSSOUrl = (redirectUrl?: string): string => {
  const url = new URL(Settings.get("site-url"));
  url.pathname = "/auth/sso";

  if (redirectUrl) {
    url.searchParams.set("redirect", redirectUrl);
  }

  return url.href;
};
