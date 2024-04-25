import * as Snowplow from "@snowplow/browser-tracker";

import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/lib/settings";
import { getUserId } from "metabase/selectors/user";

export const createTracker = store => {
  if (Settings.googleAnalyticsEnabled()) {
    createGoogleAnalyticsTracker();
  }

  if (Settings.snowplowEnabled()) {
    createSnowplowTracker(store);
  }

  if (Settings.googleAnalyticsEnabled() || Settings.snowplowEnabled()) {
    document.body.addEventListener("click", handleStructEventClick, true);
  }
};

export const trackPageView = url => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.googleAnalyticsEnabled()) {
    trackGoogleAnalyticsPageView(getSanitizedUrl(url));
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowPageView(getSanitizedUrl(url));
  }
};

/**
 * @deprecated This uses GA which is not setup. We should use `trackSchemaEvent`.
 */
export const trackStructEvent = (category, action, label, value) => {
  if (!category || !label || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.googleAnalyticsEnabled()) {
    trackGoogleAnalyticsStructEvent(category, action, label, value);
  }
};

export const trackSchemaEvent = (schema, version, data) => {
  if (shouldLogAnalytics) {
    const { event, ...other } = data;
    // eslint-disable-next-line no-console
    console.log(
      `%c[SNOWPLOW EVENT]%c, ${event}`,
      "background: #222; color: #bada55",
      "color: ",
      other,
    );
  }

  if (!schema || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowSchemaEvent(schema, version, data);
  }
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

const getSanitizedUrl = url => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^\/]+$/, (match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl());

  return urlWithoutHost.href;
};
