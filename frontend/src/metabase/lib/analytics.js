/*global ga*/
import {
  newTracker as newSnowplowTracker,
  trackStructEvent as trackSnowplowStructEvent,
  trackPageView as trackSnowplowPageView,
} from "@snowplow/browser-tracker";

import MetabaseSettings from "metabase/lib/settings";

import { DEBUG } from "metabase/lib/debug";

newSnowplowTracker("sp1", "sp.metabase.com", {
  appId: "metabase",
  plugins: [],
  platform: "web",
  post: true,
  forceSecureTracker: true,
  contexts: {
    webPage: true,
    performanceTiming: true,
  },
});

// Simple module for in-app analytics.  Sends data to GA and Snowplow.
const MetabaseAnalytics = {
  // track a pageview (a.k.a. route change)
  trackPageView: function(url: string) {
    if (!MetabaseSettings.get("anon-tracking-enabled")) {
      return;
    }
    if (url) {
      // scrub query builder urls to remove serialized json queries from path
      url = url.lastIndexOf("/q/", 0) === 0 ? "/q/" : url;

      const { tag } = MetabaseSettings.get("version") || {};

      // $FlowFixMe
      if (typeof ga === "function") {
        ga("set", "dimension1", tag);
        ga("set", "page", url);
        ga("send", "pageview", url);
      }
      trackSnowplowPageView();
    }
  },

  // track an event
  trackEvent: function(
    category: string,
    action?: ?string,
    label?: ?(string | number | boolean),
    value?: ?number,
  ) {
    if (!MetabaseSettings.get("anon-tracking-enabled")) {
      return;
    }
    const { tag } = MetabaseSettings.get("version") || {};

    // category & action are required, rest are optional
    // $FlowFixMe
    if (typeof ga === "function" && category && action) {
      ga("set", "dimension1", tag);
      ga("send", "event", category, action, label, value);
    }
    trackSnowplowStructEvent({ category, action, label, value });
    if (DEBUG) {
      console.log("trackEvent", { category, action, label, value });
    }
  },
};

export default MetabaseAnalytics;

export function registerAnalyticsClickListener() {
  // $FlowFixMe
  document.body.addEventListener(
    "click",
    function(e) {
      let node = e.target;

      // check the target and all parent elements
      while (node) {
        if (node.dataset && node.dataset.metabaseEvent) {
          // we expect our event to be a semicolon delimited string
          const parts = node.dataset.metabaseEvent
            .split(";")
            .map(p => p.trim());
          MetabaseAnalytics.trackEvent(...parts);
        }
        node = node.parentNode;
      }
    },
    true,
  );
}
