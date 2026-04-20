import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackCustomVizPluginCreated = (result: "success" | "failure") => {
  trackSimpleEvent({ event: "custom_viz_plugin_created", result });
};

export const trackCustomVizPluginUpdated = (result: "success" | "failure") => {
  trackSimpleEvent({ event: "custom_viz_plugin_updated", result });
};

export const trackCustomVizPluginDeleted = () => {
  trackSimpleEvent({ event: "custom_viz_plugin_deleted" });
};

export const trackCustomVizPluginToggled = (
  event_detail: "enabled" | "disabled",
) => {
  trackSimpleEvent({ event: "custom_viz_plugin_toggled", event_detail });
};

export const trackCustomVizPluginRefreshed = () => {
  trackSimpleEvent({ event: "custom_viz_plugin_refreshed" });
};

export const trackCustomVizSelected = () => {
  trackSimpleEvent({ event: "custom_viz_selected" });
};
