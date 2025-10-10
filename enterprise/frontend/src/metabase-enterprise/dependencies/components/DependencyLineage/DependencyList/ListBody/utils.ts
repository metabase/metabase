import { P, match } from "ts-pattern";
import { msgid, ngettext } from "ttag";

import * as Urls from "metabase/lib/urls";
import type { DependencyNode } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../../utils";

import type { SubtitleInfo, TitleInfo } from "./types";

export function getNodeTitleInfo(node: DependencyNode): TitleInfo {
  return {
    label: getNodeLabel(node),
    icon: getNodeIcon(node),
  };
}

export function getNodeSubtitleInfo(
  node: DependencyNode,
): SubtitleInfo | undefined {
  return match<DependencyNode, SubtitleInfo | undefined>(node)
    .with({ type: "card", data: { dashboard: P.nonNullable } }, (node) => ({
      label: node.data.dashboard.name,
      icon: "dashboard",
      link: Urls.dashboard(node.data.dashboard),
    }))
    .with({ type: "card", data: { collection: P.nonNullable } }, (node) => ({
      label: node.data.collection.name,
      icon: "folder",
      link: Urls.dashboard(node.data.collection),
    }))
    .otherwise(() => undefined);
}

export function getNodeViewCountLabel(viewCount: number) {
  return ngettext(msgid`${viewCount} view`, `${viewCount} views`, viewCount);
}
