import Settings from "metabase/lib/settings";
import * as Snowplow from "@snowplow/browser-tracker";

export const newTracker = () => {
  if (Settings.trackingEnabled()) {
    newGATracker();
    newSPTracker();
  }
};

export const trackPageView = url => {
  if (Settings.trackingEnabled()) {
    trackGAPageView(url);
    trackSPPageView(url);
  }
};

export const trackStructEvent = (category, action, label, value) => {
  if (Settings.trackingEnabled()) {
    trackGAStructEvent(category, action, label, value);
  }
};

export const trackSchemaEvent = (schema, data) => {
  if (Settings.trackingEnabled()) {
    trackSPSchemaEvent(schema, data);
  }
};

export const enableDataAttributesTracking = () => {
  document.body.addEventListener("click", handleStructEventClick, true);
};

const newGATracker = () => {
  const code = Settings.get("ga-code");
  window.ga?.("create", code, "auto");

  Settings.on("anon-tracking-enabled", enabled => {
    window[`ga-disable-${code}`] = enabled ? null : true;
  });
};

const trackGAPageView = url => {
  const version = Settings.get("version");
  window.ga?.("set", "dimension1", version?.tag);
  window.ga?.("set", "page", url);
  window.ga?.("send", "pageview", url);
};

const trackGAStructEvent = (category, action, label, value) => {
  const version = Settings.get("version");
  window.ga?.("set", "dimension1", version?.tag);
  window.ga?.("send", "event", category, action, label, value);
};

const newSPTracker = () => {
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

const trackSPPageView = url => {
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const trackSPSchemaEvent = (schema, data) => {
  Snowplow.trackSelfDescribingEvent({ event: { schema: `iglu:com.metabase/${schema}`, data } });
};

const handleStructEventClick = event => {
  let node = event.target;

  // check the target and all parent elements
  while (node) {
    if (node.dataset && node.dataset.metabaseEvent) {
      // we expect our event to be a semicolon delimited string
      const parts = node.dataset.metabaseEvent.split(";").map(p => p.trim());
      trackStructEvent(...parts);
    }
    node = node.parentNode;
  }
};
