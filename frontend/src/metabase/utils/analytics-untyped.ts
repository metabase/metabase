import * as Snowplow from "@snowplow/browser-tracker";

import Settings from "metabase/utils/settings";

export const trackPageView = (url: string): void => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowPageView(getSanitizedUrl(url));
  }
};

const trackSnowplowPageView = (url: string): void => {
  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const getSanitizedUrl = (url: string): string => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^/]+$/, (match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl() ?? "");

  return urlWithoutHost.href;
};
