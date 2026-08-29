import { trackSimpleEvent } from "metabase/analytics";
import type { CustomVizPluginWarning } from "metabase-types/api";

export const trackCustomVizPluginCreated = (
  result: "success" | "failure",
  warnings: readonly CustomVizPluginWarning[] = [],
) => {
  trackSimpleEvent({
    event: "custom_viz_plugin_created",
    result,
    event_detail: warningsEventDetail(warnings),
  });
};

export const trackCustomVizPluginUpdated = (
  result: "success" | "failure",
  warnings: readonly CustomVizPluginWarning[] = [],
) => {
  trackSimpleEvent({
    event: "custom_viz_plugin_updated",
    result,
    event_detail: warningsEventDetail(warnings),
  });
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

function warningsEventDetail(warnings: readonly CustomVizPluginWarning[]) {
  return warnings.length > 0
    ? warnings.map((warning) => warning.type).join(",")
    : null;
}
