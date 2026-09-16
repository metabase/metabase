import { trackSimpleEvent } from "metabase/analytics";

export type MonitorSection =
  | "diagnostics"
  | "erroring-questions"
  | "alerts"
  | "tasks"
  | "jobs"
  | "logs"
  | "model-caching"
  | "ai-auditing-usage-stats"
  | "ai-auditing-conversations"
  | "ai-auditing-mcp"
  | "ai-auditing-cli"
  | "api-key-usage";

export const trackMonitorOpened = () => {
  trackSimpleEvent({
    event: "monitor_opened",
    triggered_from: "nav_menu",
  });
};

export const trackMonitorSectionClicked = (section: MonitorSection) => {
  trackSimpleEvent({
    event: "monitor_section_clicked",
    event_detail: section,
  });
};
