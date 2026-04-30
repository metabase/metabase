import * as Snowplow from "@snowplow/browser-tracker";

import { trackMetaplowPageView } from "metabase/utils/metaplow";
import Settings from "metabase/utils/settings";

export const trackPageView = (url: string): void => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    Snowplow.setReferrerUrl("#");
    Snowplow.setCustomUrl(getSanitizedUrl(url));
    Snowplow.trackPageView();
  }

  if (Settings.get("metaplow-tracking-enabled")) {
    trackMetaplowPageView(url);
  }
};

const getSanitizedUrl = (url: string): string => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^/]+$/, (_match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl() ?? "");

  return urlWithoutHost.href;
};
