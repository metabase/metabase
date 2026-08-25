import { trackSimpleEvent } from "metabase/analytics";
import type {
  MonitorOpenedEvent,
  MonitorSectionClickedEvent,
} from "metabase-types/analytics/event";

export type MonitorSection = MonitorSectionClickedEvent["event_detail"];

export const trackMonitorOpened = () => {
  trackSimpleEvent({
    event: "monitor_opened",
    triggered_from: "nav_menu",
  } satisfies MonitorOpenedEvent);
};

export const trackMonitorSectionClicked = (section: MonitorSection) => {
  trackSimpleEvent({
    event: "monitor_section_clicked",
    event_detail: section,
  } satisfies MonitorSectionClickedEvent);
};
