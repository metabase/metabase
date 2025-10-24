import * as Urls from "metabase/lib/urls";
import type { DependencyType } from "metabase-types/api";

import type { DependencyGraphRawParams } from "../../types";

export function parseParams(
  params: DependencyGraphRawParams = {},
): Urls.DependencyGraphParams {
  const id = Urls.extractEntityId(params.id);
  const type = parseDependencyType(params.type);
  return {
    entry: id != null && type != null ? { id, type } : undefined,
  };
}

function parseDependencyType(type: unknown): DependencyType | null {
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
      return null;
  }
}
