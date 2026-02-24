import type { GraphNodeModel, GraphViewNode, DependentsCount } from "../../src/shared-types";

export interface NodeTypeInfo {
  label: string;
  color: string;
}

export interface DependentGroup {
  type: GraphNodeModel;
  count: number;
}

export function getNodeTypeInfo(node: GraphViewNode): NodeTypeInfo {
  if (
    node.model === "question" &&
    node.queryType === "native"
  ) {
    return { label: "SQL question", color: "var(--graph-text-secondary)" };
  }

  return getGroupTypeInfo(node.model);
}

export function getGroupTypeInfo(model: GraphNodeModel): NodeTypeInfo {
  switch (model) {
    case "question":
      return { label: "Question", color: "var(--graph-text-secondary)" };
    case "model":
      return { label: "Model", color: "var(--graph-color-brand)" };
    case "metric":
      return { label: "Metric", color: "var(--graph-color-summarize)" };
    case "table":
      return { label: "Table", color: "var(--graph-color-brand)" };
    case "transform":
      return { label: "Transform", color: "var(--graph-color-warning)" };
    case "snippet":
      return { label: "Snippet", color: "var(--graph-text-secondary)" };
    case "dashboard":
      return { label: "Dashboard", color: "var(--graph-color-filter)" };
    case "document":
      return { label: "Document", color: "var(--graph-text-secondary)" };
    case "segment":
      return { label: "Segment", color: "var(--graph-color-accent2)" };
    case "measure":
      return { label: "Measure", color: "var(--graph-color-summarize)" };
    case "collection":
      return { label: "Collection", color: "var(--graph-text-secondary)" };
    case "action":
      return { label: "Action", color: "var(--graph-text-secondary)" };
    case "database":
      return { label: "Database", color: "var(--graph-color-brand)" };
    case "field":
      return { label: "Field", color: "var(--graph-text-secondary)" };
  }
}

export function getNodeIcon(node: GraphViewNode): string {
  return getNodeIconForModel(node.model, node.cardType, node.queryType, node.display);
}

export function getNodeIconForModel(
  model: GraphNodeModel,
  cardType?: string,
  queryType?: string,
  display?: string,
): string {
  switch (model) {
    case "question":
      if (queryType === "native") return "⌨";
      return "📊";
    case "model":
      return "🧊";
    case "metric":
      return "📈";
    case "table":
      return "⊞";
    case "transform":
      return "⚙";
    case "snippet":
      return "✂";
    case "dashboard":
      return "▦";
    case "document":
      return "📄";
    case "segment":
      return "⊟";
    case "measure":
      return "∑";
    case "collection":
      return "📁";
    case "action":
      return "⚡";
    case "database":
      return "🗄";
    case "field":
      return "⊡";
  }
}

export function getDependentGroups(node: GraphViewNode): DependentGroup[] {
  const counts = node.dependentsCount;
  if (!counts) return [];

  const groups: DependentGroup[] = [];
  const entries: Array<[keyof DependentsCount, GraphNodeModel]> = [
    ["question", "question"],
    ["model", "model"],
    ["metric", "metric"],
    ["table", "table"],
    ["transform", "transform"],
    ["snippet", "snippet"],
    ["dashboard", "dashboard"],
    ["document", "document"],
    ["segment", "segment"],
    ["measure", "measure"],
  ];

  for (const [key, model] of entries) {
    const count = counts[key];
    if (count && count > 0) {
      groups.push({ type: model, count });
    }
  }

  return groups;
}

export function getDependencyGroupTitle(
  node: GraphViewNode,
  groups: DependentGroup[],
): string {
  if (groups.length === 0) return "Nothing uses this";
  if (node.model === "transform") return "Generates";
  return "Used by";
}

export function getDependentGroupLabel(group: DependentGroup): string {
  const { type, count } = group;
  const plural = count !== 1;

  switch (type) {
    case "question":
      return `${count} question${plural ? "s" : ""}`;
    case "model":
      return `${count} model${plural ? "s" : ""}`;
    case "metric":
      return `${count} metric${plural ? "s" : ""}`;
    case "table":
      return `${count} table${plural ? "s" : ""}`;
    case "transform":
      return `${count} transform${plural ? "s" : ""}`;
    case "snippet":
      return `${count} snippet${plural ? "s" : ""}`;
    case "dashboard":
      return `${count} dashboard${plural ? "s" : ""}`;
    case "document":
      return `${count} document${plural ? "s" : ""}`;
    case "segment":
      return `${count} segment${plural ? "s" : ""}`;
    case "measure":
      return `${count} measure${plural ? "s" : ""}`;
    default:
      return `${count} entit${plural ? "ies" : "y"}`;
  }
}

export function getFieldIcon(semanticType: string | null): string {
  if (!semanticType) return "#";
  if (semanticType.includes("PK") || semanticType === "type/PK") return "🔑";
  if (semanticType.includes("FK") || semanticType === "type/FK") return "🔗";
  return "#";
}
