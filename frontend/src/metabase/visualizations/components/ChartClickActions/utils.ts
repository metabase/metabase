import _ from "underscore";
import { t } from "ttag";
import type { ClickActionBase, RegularClickAction } from "metabase/modes/types";

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
  averages: {
    icon: "curve",
  },
  dashboard: {
    icon: "dashboard",
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
};
Object.values(SECTIONS).map((section, index) => {
  section.index = index;
});

export const getGroupedAndSortedActions = (
  clickActions: RegularClickAction[],
) => {
  const groupedClickActions: Record<string, RegularClickAction[]> = _.groupBy(
    clickActions,
    "section",
  );

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
  const hasOnlyOneSortAction = groupedClickActions["sort"]?.length === 1;
  if (hasOnlyOneSortAction) {
    // restyle the Formatting action when there is only one option
    groupedClickActions["sort"][0] = {
      ...groupedClickActions["sort"][0],
      buttonType: "horizontal",
    };
  }

  return _.chain(groupedClickActions)
    .pairs()
    .sortBy(([key]) => (SECTIONS[key] ? SECTIONS[key].index : 99))
    .value();
};

export const getGALabelForAction = (action: ClickActionBase) =>
  action ? `${action.section || ""}:${action.name || ""}` : null;

export const getSectionTitle = (sectionKey: string): string | null => {
  switch (sectionKey) {
    case "filter":
      return t`Filter by this value`;

    case "sum":
      return t`Summarize`;

    case "auto-popover":
      return t`Automatic insights…`;

    case "breakout-popover":
      return t`Break out by…`;
  }

  return null;
};

export type ContentDirectionType = "column" | "row";

export const getSectionContentDirection = (
  sectionKey: string,
): ContentDirectionType => {
  switch (sectionKey) {
    case "sort":
    case "sum":
    case "filter":
      return "row";
  }

  return "column";
};
