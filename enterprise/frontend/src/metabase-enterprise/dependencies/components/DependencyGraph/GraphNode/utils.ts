import { msgid, ngettext, t } from "ttag";

import type { DependencyNode } from "metabase-types/api";

import type { DependentGroup } from "./types";

export function getDependentGroups(node: DependencyNode): DependentGroup[] {
  const {
    question = 0,
    model = 0,
    metric = 0,
    table = 0,
    transform = 0,
    snippet = 0,
    dashboard = 0,
    document = 0,
    sandbox = 0,
  } = node.dependents_count ?? {};

  const groups: DependentGroup[] = [
    { type: "question", count: question },
    { type: "model", count: model },
    { type: "metric", count: metric },
    { type: "table", count: table },
    { type: "transform", count: transform },
    { type: "snippet", count: snippet },
    { type: "dashboard", count: dashboard },
    { type: "document", count: document },
    { type: "sandbox", count: sandbox },
  ];

  return groups.filter(({ count }) => count !== 0);
}

export function getDependencyGroupTitle(
  node: DependencyNode,
  groups: DependentGroup[],
) {
  if (node.type === "transform") {
    return t`Generates`;
  }
  if (node.type === "sandbox") {
    return t`Restricts table data`;
  }
  if (groups.length === 0) {
    return t`Nothing uses this`;
  }
  return t`Used by`;
}

export function getDependentGroupLabel({
  type,
  count,
}: DependentGroup): string {
  switch (type) {
    case "question":
      return ngettext(msgid`${count} question`, `${count} questions`, count);
    case "model":
      return ngettext(msgid`${count} model`, `${count} models`, count);
    case "metric":
      return ngettext(msgid`${count} metric`, `${count} metrics`, count);
    case "table":
      return ngettext(msgid`${count} table`, `${count} tables`, count);
    case "transform":
      return ngettext(msgid`${count} transform`, `${count} transforms`, count);
    case "snippet":
      return ngettext(msgid`${count} snippet`, `${count} snippet`, count);
    case "dashboard":
      return ngettext(msgid`${count} dashboard`, `${count} dashboards`, count);
    case "document":
      return ngettext(msgid`${count} document`, `${count} documents`, count);
    case "sandbox":
      return ngettext(
        msgid`${count} row and column security rule`,
        `${count} row and column security rules`,
        count,
      );
  }
}
