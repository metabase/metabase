import { P, match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type {
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type { GraphSelection } from "../types";
import { getNodeIcon, getNodeLabel, getNodeLink } from "../utils";

import type { LinkInfo } from "./types";

export function getRequest(
  selection: GraphSelection,
): ListNodeDependentsRequest {
  return {
    id: selection.node.id,
    type: selection.node.type,
    dependent_type: match(selection.type)
      .with(P.union("question", "model", "metric"), () => "card" as const)
      .otherwise((type) => type),
    dependent_card_type: match(selection.type)
      .with(P.union("question", "model", "metric"), (type) => type)
      .otherwise(() => undefined),
  };
}

export function getHeaderLabel(selection: GraphSelection) {
  const nodeLabel = getNodeLabel(selection.node);

  return match(selection.type)
    .with("question", () => t`Questions that use ${nodeLabel}`)
    .with("model", () => t`Models that use ${nodeLabel}`)
    .with("metric", () => t`Metrics that use ${nodeLabel}`)
    .with("table", () => t`Tables that use ${nodeLabel}`)
    .with("transform", () => t`Transforms that use ${nodeLabel}`)
    .with("snippet", () => t`Snippets that use ${nodeLabel}`)
    .exhaustive();
}

export function getNodeTitle(node: DependencyNode): LinkInfo {
  return {
    label: getNodeLabel(node),
    icon: getNodeIcon(node),
    link: getNodeLink(node),
  };
}

export function getNodeSubtitle(node: DependencyNode): LinkInfo | undefined {
  return match<DependencyNode, LinkInfo | undefined>(node)
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
    .with({ type: "card" }, () => undefined)
    .with({ type: "table" }, () => undefined)
    .with({ type: "transform" }, () => undefined)
    .with({ type: "snippet" }, () => undefined)
    .exhaustive();
}
