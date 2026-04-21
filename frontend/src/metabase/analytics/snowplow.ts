import type { EnhancedStore } from "@reduxjs/toolkit";
import * as Snowplow from "@snowplow/browser-tracker";

import type { State } from "metabase/redux/store";
import { getUserId } from "metabase/selectors/user";
import Settings from "metabase/utils/settings";

export const createSnowplowTracker = (store: EnhancedStore<State>): void => {
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
    plugins: [createSnowplowPlugin(store)],
  });
};

const createSnowplowPlugin = (store: EnhancedStore<State>) => {
  return {
    beforeTrack: () => {
      const userId = getUserId(store.getState());
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
