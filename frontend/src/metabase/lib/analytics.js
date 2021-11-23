import * as Snowplow from "@snowplow/browser-tracker";
import Settings from "metabase/lib/settings";
import { getUserId } from "metabase/selectors/user";
import { isProduction } from "metabase/env";

export const createTracker = store => {
  if (isGoogleAnalyticsEnabled()) {
    createGoogleAnalyticsTracker();
  }

  if (isSnowplowEnabled()) {
    createSnowplowTracker(store);
  }

  if (isGoogleAnalyticsEnabled() || isSnowplowEnabled()) {
    document.body.addEventListener("click", handleStructEventClick, true);
  }
};

export const trackPageView = url => {
  if (!url) {
    return;
  }

  if (isGoogleAnalyticsEnabled()) {
    trackGoogleAnalyticsPageView(url);
  }

  if (isSnowplowEnabled()) {
    trackSnowplowPageView(url);
  }
};

export const trackStructEvent = (category, action, label, value) => {
  if (!category || !label) {
    return;
  }

  if (isGoogleAnalyticsEnabled()) {
    trackGoogleAnalyticsStructEvent(category, action, label, value);
  }
};

export const trackSchemaEvent = (schema, version, data) => {
  if (!schema) {
    return;
  }

  if (isSnowplowEnabled()) {
    trackSnowplowSchemaEvent(schema, version, data);
  }
};

const isGoogleAnalyticsEnabled = () => {
  return Settings.trackingEnabled() && isProduction;
};

const isSnowplowEnabled = () => {
  return Settings.trackingEnabled() && Settings.snowplowAvailable();
};

const createGoogleAnalyticsTracker = () => {
  const code = Settings.get("ga-code");
  window.ga?.("create", code, "auto");

  Settings.on("anon-tracking-enabled", enabled => {
    window[`ga-disable-${code}`] = enabled ? null : true;
  });
};

const trackGoogleAnalyticsPageView = url => {
  const version = Settings.get("version", {});
  window.ga?.("set", "dimension1", version.tag);
  window.ga?.("set", "page", url);
  window.ga?.("send", "pageview", url);
};

const trackGoogleAnalyticsStructEvent = (category, action, label, value) => {
  const version = Settings.get("version", {});
  window.ga?.("set", "dimension1", version.tag);
  window.ga?.("send", "event", category, action, label, value);
};

const createSnowplowTracker = store => {
  Snowplow.newTracker("sp", Settings.snowplowUrl(), {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    discoverRootDomain: true,
    contexts: { webPage: true },
    anonymousTracking: { withServerAnonymisation: true },
    stateStorageStrategy: "none",
    plugins: [createSnowplowPlugin(store)],
  });
};

const createSnowplowPlugin = store => {
  return {
    beforeTrack: () => {
      const userId = getUserId(store.getState());
      userId && Snowplow.setUserId(String(userId));
    },
    contexts: () => {
      const id = Settings.get("analytics-uuid");
      const version = Settings.get("version", {});
      const createdAt = Settings.get("instance-creation");
      const tokenFeatures = Settings.get("token-features");

      return [
        {
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: {
            id,
            version: {
              tag: version.tag,
            },
            created_at: createdAt,
            token_features: tokenFeatures,
          },
        },
      ];
    },
  };
};

const trackSnowplowPageView = url => {
  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const trackSnowplowSchemaEvent = (schema, version, data) => {
  Snowplow.trackSelfDescribingEvent({
    event: {
      schema: `iglu:com.metabase/${schema}/jsonschema/${version}`,
      data,
    },
  });
};

const handleStructEventClick = event => {
  if (!Settings.trackingEnabled()) {
    return;
  }

  for (let node = event.target; node != null; node = node.parentNode) {
    if (node.dataset && node.dataset.metabaseEvent) {
      const parts = node.dataset.metabaseEvent.split(";").map(p => p.trim());
      trackStructEvent(...parts);
    }
  }
};
