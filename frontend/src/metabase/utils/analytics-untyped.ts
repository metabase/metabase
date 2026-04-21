import * as Snowplow from "@snowplow/browser-tracker";

import Settings from "metabase/utils/settings";

export const trackPageView = (url: string): void => {
  if (!url || !Settings.trackingEnabled() || !Settings.snowplowEnabled()) {
    return;
  }

  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(getSanitizedUrl(url));
  Snowplow.trackPageView();
};

const getSanitizedUrl = (url: string): string => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^/]+$/, (_match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl() ?? "");

  return urlWithoutHost.href;
};
