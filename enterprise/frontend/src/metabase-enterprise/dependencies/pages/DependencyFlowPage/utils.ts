import * as Urls from "metabase/lib/urls";
import type { DependencyEntry, DependencyType } from "metabase-types/api";

import type { DependencyFlowParams } from "./types";

export function parseParams(
  params: DependencyFlowParams = {},
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(params.id);
  const type = parseDependencyType(params.type);
  return id != null && type != null ? { id, type } : undefined;
}

function parseDependencyType(type: unknown): DependencyType | undefined {
  switch (type) {
    case "card":
    case "table":
    case "transform":
    case "snippet":
      return type;
    default:
      return undefined;
  }
}
