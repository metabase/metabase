import MetabaseSettings from "metabase/lib/settings";

/*global ga*/

export const trackPageView = url => {
  if (!url) {
    return;
  }

  const version = MetabaseSettings.get("version");

  if (typeof ga === "function") {
    ga("set", "dimension1", version?.tag);
    ga("set", "page", url);
    ga("send", "pageview", url);
  }
};

export const trackStructEvent = (category, action, label, value) => {
  if (!category || !action) {
    return;
  }

  const version = MetabaseSettings.get("version");

  if (typeof ga === "function") {
    ga("set", "dimension1", version?.tag);
    ga("send", "event", category, action, label, value);
  }
};

export const handleTrackingSettingsChange = () => {
  const handleSettingChange = enabled => {
    const code = MetabaseSettings.get("ga-code");
    window[`ga-disable-${code}`] = enabled ? null : true;
  };

  MetabaseSettings.on("anon-tracking-enabled", handleSettingChange);
};

export const handleTrackingDataAttributes = () => {
  const handleBodyClick = e => {
    let node = e.target;

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

  document.body.addEventListener("click", handleBodyClick, true);
};
