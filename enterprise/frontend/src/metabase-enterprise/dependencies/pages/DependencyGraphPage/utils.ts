import * as Urls from "metabase/lib/urls";
import type { DependencyEntry, DependencyType } from "metabase-types/api";

import type { DependencyGraphRawParams } from "../../types";

export function parseParams(
  params: DependencyGraphRawParams = {},
): Urls.DependencyGraphParams {
  return {
    entry: parseEntry(params.entryId, params.entryType),
  };
}

function parseEntry(
  rawId?: string,
  rawType?: string,
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(rawId);
  const type = parseDependencyType(rawType);
  return id != null && type != null ? { id, type } : undefined;
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
