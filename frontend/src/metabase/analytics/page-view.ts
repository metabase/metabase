/* eslint-disable @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import * as Snowplow from "@snowplow/browser-tracker";

import {
  sanitizeAnalyticsPathname,
  trackMetaplowPageView,
} from "metabase/utils/metaplow";
import Settings from "metabase/utils/settings";

export const trackPageView = (url: string): void => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    setSnowplowPageUrl(url);
    Snowplow.trackPageView();
  }

  if (Settings.get("metaplow-tracking-enabled")) {
    trackMetaplowPageView(url);
  }
};

/** Reports `pathname`, without customer-chosen names, as the page of later Snowplow events, with no referrer. */
export const setSnowplowPageUrl = (pathname: string): void => {
  if (!Settings.snowplowEnabled()) {
    return;
  }

  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(getSanitizedUrl(pathname));
};

const getSanitizedUrl = (url: string): string =>
  new URL(sanitizeAnalyticsPathname(url), Settings.snowplowUrl() ?? "").href;
