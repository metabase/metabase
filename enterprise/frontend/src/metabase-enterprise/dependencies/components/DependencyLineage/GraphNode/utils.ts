import { msgid, ngettext } from "ttag";

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
  } = node.dependents ?? {};

  const groups: DependentGroup[] = [
    { category: "question", count: question },
    { category: "model", count: model },
    { category: "metric", count: metric },
    { category: "table", count: table },
    { category: "transform", count: transform },
    { category: "snippet", count: snippet },
  ];

  return groups.filter(({ count }) => count !== 0);
}

export function getDependentGroupLabel({ category, count }: DependentGroup) {
  switch (category) {
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
      return ngettext(msgid`${count} snippet`, `${count} snippets`, count);
  }
}
