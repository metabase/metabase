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

type SnowplowPageUrlOptions = {
  /** Report the origin of the page that loaded this document as the referrer, instead of none. */
  keepReferrerOrigin?: boolean;
};

/** Reports `pathname`, without customer-chosen names, as the page of later Snowplow events. */
export const setSnowplowPageUrl = (
  pathname: string,
  { keepReferrerOrigin = false }: SnowplowPageUrlOptions = {},
): void => {
  if (!Settings.snowplowEnabled()) {
    return;
  }

  Snowplow.setReferrerUrl(keepReferrerOrigin ? getReferrerOrigin() : "#");
  Snowplow.setCustomUrl(getSanitizedUrl(pathname));
};

const getSanitizedUrl = (url: string): string =>
  new URL(sanitizeAnalyticsPathname(url), Settings.snowplowUrl() ?? "").href;

const getReferrerOrigin = (): string => {
  try {
    const { origin } = new URL(document.referrer);
    return origin === "null" ? "#" : origin;
  } catch {
    return "#";
  }
};
