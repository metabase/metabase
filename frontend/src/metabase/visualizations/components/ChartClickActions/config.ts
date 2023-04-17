import type { ClickAction } from "metabase-types/types/Visualization";

type Section = {
  icon: string;
  index?: number;
};

export const SECTIONS: Record<string, Section> = {
  records: {
    icon: "table2",
  },
  zoom: {
    icon: "zoom_in",
  },
  details: {
    icon: "document",
  },
  sort: {
    icon: "sort",
  },
  formatting: {
    icon: "gear",
  },
  breakout: {
    icon: "breakout",
  },
  standalone_filter: {
    icon: "filter",
  },
  filter: {
    icon: "funnel_outline",
  },
  // There is no such icon as "summarize." This is used to ID and select the actions that we,
  // want to make larger, like Distribution, Sum over Time, etc.
  summarize: {
    icon: "summarize",
  },
  sum: {
    icon: "sum",
  },
  averages: {
    icon: "curve",
  },
  dashboard: {
    icon: "dashboard",
  },
  auto: {
    icon: "bolt",
  },
  info: {
    icon: "info",
  },
};
Object.values(SECTIONS).map((section, index) => {
  section.index = index;
});

export const getGALabelForAction = (action: ClickAction) =>
  action ? `${action.section || ""}:${action.name || ""}` : null;
