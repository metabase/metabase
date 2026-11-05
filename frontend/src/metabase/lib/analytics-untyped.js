import * as Snowplow from "@snowplow/browser-tracker";

import {
  getCollectorHostUrl,
  initMetaplow,
  trackMetaplowPageView,
} from "metabase/lib/metaplow";
import Settings from "metabase/lib/settings";
import { getUserId } from "metabase/selectors/user";

export const trackPageView = (url) => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowPageView(getSanitizedUrl(url));
  }

  if (Settings.get("metaplow-tracking-enabled")) {
    trackMetaplowPageView(url);
  }
};
export const createTracker = (store) => {
  if (Settings.snowplowEnabled()) {
    createSnowplowTracker(store);
  }
  initMetaplow({
    hostUrl: getCollectorHostUrl(),
    getUserId: () => getUserId(store.getState()),
  });
};

const createSnowplowPlugin = (store) => {
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

const createSnowplowTracker = (store) => {
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

const trackSnowplowPageView = (url) => {
  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const getSanitizedUrl = (url) => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^\/]+$/, (match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl());

  return urlWithoutHost.href;
};
