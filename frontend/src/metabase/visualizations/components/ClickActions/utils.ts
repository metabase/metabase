import { t } from "ttag";
import _ from "underscore";

import type {
  RegularClickAction,
  ClickActionSection,
} from "metabase/visualizations/types";

type Section = {
  icon: string;
  index?: number;
};

export const SECTIONS: Record<ClickActionSection, Section> = {
  records: {
    icon: "table2",
  },
  zoom: {
    icon: "zoom_in",
  },
  sort: {
    icon: "sort",
  },
  breakout: {
    icon: "breakout",
  },
  "breakout-popover": {
    icon: "breakout",
  },
  standalone_filter: {
    icon: "filter",
  },
  // There is no such icon as "summarize." This is used to ID and select the actions that we,
  // want to make larger, like Distribution, Sum over Time, etc.
  summarize: {
    icon: "summarize",
  },
  sum: {
    icon: "sum",
  },
  extract: {
    icon: "extract",
  },
  "extract-popover": {
    icon: "extract",
  },
  auto: {
    icon: "bolt",
  },
  "auto-popover": {
    icon: "bolt",
  },
  info: {
    icon: "info",
  },
  filter: {
    icon: "funnel_outline",
  },
  details: {
    icon: "document",
  },
};
Object.values(SECTIONS).map((section, index) => {
  section.index = index;
});

export const getGroupedAndSortedActions = (
  clickActions: RegularClickAction[],
) => {
  const groupedClickActions = _.groupBy(clickActions, "section") as {
    [key in ClickActionSection]?: RegularClickAction[];
  };

  if (groupedClickActions["sum"]?.length === 1) {
    // if there's only one "sum" click action, merge it into "summarize" and change its button type and icon
    if (!groupedClickActions["summarize"]) {
      groupedClickActions["summarize"] = [];
    }
    groupedClickActions["summarize"].push({
      ...groupedClickActions["sum"][0],
      buttonType: "horizontal",
      icon: "number",
    });
    delete groupedClickActions["sum"];
  }

  return _.chain(groupedClickActions)
    .pairs()
    .sortBy(([key]) => (SECTIONS[key] ? SECTIONS[key].index : 99))
    .value();
};

export const getGALabelForAction = (action: RegularClickAction) =>
  action ? `${action.section || ""}:${action.name || ""}` : null;

export const getSectionTitle = (
  sectionKey: string,
  actions: RegularClickAction[],
): string | null => {
  switch (sectionKey) {
    case "filter":
      return actions[0]?.sectionTitle ?? `Filter by this value`;

    case "sum":
      return t`Summarize`;

    case "auto-popover":
      return t`Automatic insights…`;

    case "breakout-popover":
      return t`Break out by…`;

    case "extract-popover":
      return t`Select a part to extract`;
  }

  return null;
};

export type ContentDirectionType = "column" | "row";

export const getSectionContentDirection = (
  sectionKey: string,
  actions: RegularClickAction[],
): ContentDirectionType => {
  switch (sectionKey) {
    case "sum":
      return "row";

    case "filter": {
      return actions[0]?.sectionDirection ?? "column";
    }

    case "sort": {
      return "row";
    }
  }

  return "column";
};
