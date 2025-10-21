import * as Urls from "metabase/lib/urls";
import type { DependencyType } from "metabase-types/api";

import type { DependencyLineageRawParams } from "../../types";

export function parseParams(
  params: DependencyLineageRawParams = {},
): Urls.DependencyLineageParams {
  const id = Urls.extractEntityId(params.id);
  const type = parseDependencyType(params.type);
  return {
    entry: id != null && type != null ? { id, type } : undefined,
  };
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
