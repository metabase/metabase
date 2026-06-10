import * as Snowplow from "@snowplow/browser-tracker";

import Settings from "metabase/utils/settings";

type GetUserId = () => number | undefined;

export const createSnowplowTracker = (getUserId: GetUserId): void => {
  if (!Settings.snowplowEnabled()) {
    return;
  }

  Snowplow.newTracker("sp", Settings.snowplowUrl() ?? "", {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    discoverRootDomain: true,
    contexts: { webPage: true },
    anonymousTracking: { withServerAnonymisation: true },
    stateStorageStrategy: "none",
    plugins: [createSnowplowPlugin(getUserId)],
  });
};

const createSnowplowPlugin = (getUserId: GetUserId) => {
  return {
    beforeTrack: () => {
      const userId = getUserId();
      if (userId) {
        Snowplow.setUserId(String(userId));
      }
    },
    contexts: () => {
      const id = Settings.get("analytics-uuid");
      const version = Settings.get("version") ?? {};
      const createdAt = Settings.get("instance-creation");
      const tokenFeatures = Settings.get("token-features");

      return [
        {
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: {
            id,
            version: {
              tag: (version as { tag?: string }).tag,
            },
            created_at: createdAt,
            token_features: tokenFeatures,
          },
        },
      ];
    },
  };
};
