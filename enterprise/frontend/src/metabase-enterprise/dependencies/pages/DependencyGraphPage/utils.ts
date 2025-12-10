import * as Urls from "metabase/lib/urls";
import type { DependencyEntry } from "metabase-types/api";

import { parseDependencyType } from "../../utils";

export function parseDependencyEntry(
  rawId?: string,
  rawType?: string,
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(rawId);
  const type = parseDependencyType(rawType);
  return id != null && type != null ? { id, type } : undefined;
}
