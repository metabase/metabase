import Settings from "metabase/lib/settings";
import * as Snowplow from "@snowplow/browser-tracker";
import { isProduction } from "metabase/env";

export const createTracker = () => {
  if (isTrackingEnabled()) {
    createGoogleAnalyticsTracker();
    createSnowplowTracker();
  }
};

export const trackPageView = url => {
  if (isTrackingEnabled()) {
    trackGoogleAnalyticsPageView(url);
    trackSnowplowPageView(url);
  }
};

export const trackStructEvent = (category, action, label, value) => {
  if (isTrackingEnabled()) {
    trackGoogleAnalyticsStructEvent(category, action, label, value);
  }
};

export const trackSchemaEvent = (schema, data) => {
  if (isTrackingEnabled()) {
    trackSnowplowSchemaEvent(schema, data);
  }
};

export const enableDataAttributesTracking = () => {
  document.body.addEventListener("click", handleStructEventClick, true);
};

const createGoogleAnalyticsTracker = () => {
  const code = Settings.get("ga-code");
  window.ga?.("create", code, "auto");

  Settings.on("anon-tracking-enabled", enabled => {
    window[`ga-disable-${code}`] = enabled ? null : true;
  });
};

const trackGoogleAnalyticsPageView = url => {
  const version = Settings.get("version");
  window.ga?.("set", "dimension1", version?.tag);
  window.ga?.("set", "page", url);
  window.ga?.("send", "pageview", url);
};

const trackGoogleAnalyticsStructEvent = (category, action, label, value) => {
  const version = Settings.get("version");
  window.ga?.("set", "dimension1", version?.tag);
  window.ga?.("send", "event", category, action, label, value);
};

const createSnowplowTracker = () => {
  Snowplow.newTracker("sp", "https://sp.metabase.com", {
    appId: "metabase",
    platform: "web",
    cookieSameSite: "Lax",
    discoverRootDomain: true,
    contexts: {
      webPage: true,
    },
  });
};

const trackSnowplowPageView = url => {
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const trackSnowplowSchemaEvent = (schema, data) => {
  Snowplow.trackSelfDescribingEvent({
    event: { schema: `iglu:com.metabase/${schema}`, data },
  });
};

const isTrackingEnabled = () => {
  return isProduction && Settings.trackingEnabled();
}

const handleStructEventClick = event => {
  if (!isTrackingEnabled()) {
    return;
  }

  for (let node = event.target; node != null; node = node.parentNode) {
    if (node.dataset && node.dataset.metabaseEvent) {
      const parts = node.dataset.metabaseEvent.split(";").map(p => p.trim());
      trackStructEvent(...parts);
    }
  }
};
