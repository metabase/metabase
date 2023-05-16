import _ from "underscore";
import { t } from "ttag";
import type { RegularClickAction } from "metabase/modes/types";
import { ClickActionSection } from "metabase/modes/types";

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
  details: {
    icon: "document",
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
  if (groupedClickActions["sort"]?.length === 1) {
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

export const getGALabelForAction = (action: RegularClickAction) =>
  action ? `${action.section || ""}:${action.name || ""}` : null;

const getFilterValueType = (actions: RegularClickAction[]): string =>
  actions[0]?.extra?.().valueType as string;

export const getFilterSectionTitle = (actions: RegularClickAction[]) => {
  const valueType = getFilterValueType(actions);

  if (valueType === "date") {
    return t`Filter by this date`;
  }

  if (valueType === "text") {
    return t`Filter by this text`;
  }

  return t`Filter by this value`;
};

export const getSectionTitle = (
  sectionKey: string,
  actions: RegularClickAction[],
): string | null => {
  switch (sectionKey) {
    case "filter":
      return getFilterSectionTitle(actions);

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
  actions: RegularClickAction[],
): ContentDirectionType => {
  switch (sectionKey) {
    case "sum":
      return "row";

    case "filter": {
      const valueType = getFilterValueType(actions);

      if (["boolean", "numeric", "null"].includes(valueType)) {
        return "row";
      }
      break;
    }

    case "sort": {
      if (actions.length > 1) {
        return "row";
      }
    }
  }

  return "column";
};
