import * as Urls from "metabase/lib/urls";
import { DEPENDENCY_TYPES, type DependencyEntry } from "metabase-types/api";

export function parseDependencyEntry(
  rawId?: string,
  rawType?: string,
): DependencyEntry | undefined {
  const id = Urls.extractEntityId(rawId);
  const type = Urls.parseEnumParam(rawType, DEPENDENCY_TYPES);
  return id != null && type != null ? { id, type } : undefined;
}
