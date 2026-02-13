import type {
  CheckReplaceSourceInfo,
  DependencyNode,
} from "metabase-types/api";

import type { TabInfo } from "./types";

export function getTabs(
  nodes: DependencyNode[] | undefined,
  checkInfo: CheckReplaceSourceInfo | undefined,
): TabInfo[] {
  const tabs: TabInfo[] = [];
  if (nodes == null) {
    return [];
  }

  tabs.push({ type: "descendants", nodes: nodes });
  if (checkInfo?.errors != null) {
    tabs.push(
      ...checkInfo.errors.map((error) => ({ type: error.type, error })),
    );
  }
  return tabs;
}
