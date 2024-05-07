import { t } from "ttag";
import _ from "underscore";

import type {
  RegularClickAction,
  ClickActionSection,
} from "metabase/visualizations/types";

type Section = {
  index?: number;
};

export const SECTIONS: Record<ClickActionSection, Section> = {
  records: {},
  zoom: {},
  sort: {},
  breakout: {},
  "breakout-popover": {},
  standalone_filter: {},
  summarize: {},
  sum: {},
  combine: {},
  "combine-popover": {},
  extract: {},
  "extract-popover": {},
  auto: {},
  "auto-popover": {},
  info: {},
  filter: {},
  details: {},
  custom: {},
  "new-column": {},
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

    case "new-column":
      return t`New column`;
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
