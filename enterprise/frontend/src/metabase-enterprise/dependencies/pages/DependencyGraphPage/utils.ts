import * as Urls from "metabase/lib/urls";
import type { DependencyEntry, DependencyType } from "metabase-types/api";

export function parseDependencyEntry(
  rawId?: string,
  rawType?: string,
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(rawId);
  const type = parseDependencyType(rawType);
  return id != null && type != null ? { id, type } : undefined;
}

function parseDependencyType(type: unknown): DependencyType | undefined {
  switch (type) {
    case "card":
    case "table":
    case "transform":
    case "snippet":
    case "dashboard":
    case "document":
    case "sandbox":
      return type;
    default:
      return undefined;
  }
}
