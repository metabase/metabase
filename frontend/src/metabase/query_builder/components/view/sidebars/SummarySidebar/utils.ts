import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type SummaryFieldItem = {
  key: string;
  name: string;
  icon: IconName;
};

export type SummaryFieldSection = {
  key: string;
  name: string;
  items: SummaryFieldItem[];
};

function getMeasureItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldItem[] {
  return Lib.availableMeasures(query, stageIndex).map((measure) => {
    const { name, displayName } = Lib.displayInfo(query, stageIndex, measure);
    return { key: name, name: displayName, icon: "ruler" };
  });
}

function getMetricItems(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldItem[] {
  return Lib.availableMetrics(query, stageIndex).map((metric) => {
    const { name, displayName } = Lib.displayInfo(query, stageIndex, metric);
    return { key: name, name: displayName, icon: "metric" };
  });
}

function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  return Lib.groupColumns(columns).map((group, groupIndex) => {
    const { displayName } = Lib.displayInfo(query, stageIndex, group);
    const items = Lib.getColumnsFromColumnGroup(group).map((column) => {
      const { name, displayName } = Lib.displayInfo(query, stageIndex, column);
      return { key: name, name: displayName, icon: getColumnIcon(column) };
    });
    return { key: `table-${groupIndex}`, name: displayName, items };
  });
}

/**
 * The fields the summary can be built from, in sections: the measures and metrics of the
 * query's source, then the breakoutable columns grouped by the table they come from, in the
 * order the query reaches those tables. Sections with no items are left out.
 */
export function getFieldSections(
  query: Lib.Query,
  stageIndex: number,
): SummaryFieldSection[] {
  const sections: SummaryFieldSection[] = [
    {
      key: "measures",
      name: t`Measures`,
      items: getMeasureItems(query, stageIndex),
    },
    {
      key: "metrics",
      name: t`Metrics`,
      items: getMetricItems(query, stageIndex),
    },
    ...getColumnSections(query, stageIndex),
  ];
  return sections.filter((section) => section.items.length > 0);
}

/**
 * The sections with only the items whose names contain `searchText`, ignoring case and
 * surrounding whitespace; sections left with no items are dropped. Returns `sections` itself
 * for a blank search.
 */
export function filterFieldSections(
  sections: SummaryFieldSection[],
  searchText: string,
): SummaryFieldSection[] {
  const needle = searchText.trim().toLowerCase();
  if (needle.length === 0) {
    return sections;
  }
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.name.toLowerCase().includes(needle),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
