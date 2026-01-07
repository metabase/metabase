import * as Urls from "metabase/lib/urls";
import { DEPENDENCY_TYPES, type DependencyEntry } from "metabase-types/api";

import { parseEnum } from "../../utils";

export function parseDependencyEntry(
  rawId?: string,
  rawType?: string,
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(rawId);
  const type = parseEnum(rawType, DEPENDENCY_TYPES);
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
    case "segment":
    case "measure":
      return type;
    default:
      return undefined;
  }
}
