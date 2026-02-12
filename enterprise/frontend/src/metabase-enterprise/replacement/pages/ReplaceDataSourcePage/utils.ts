import type { Location } from "history";

import * as Urls from "metabase/lib/urls";
import {
  REPLACE_SOURCE_ENTITY_TYPES,
  type ReplaceSourceEntry,
} from "metabase-types/api";

export function parseParams(location: Location): Urls.ReplaceDataSourceParams {
  const {
    source_entity_id,
    source_entity_type,
    target_entity_id,
    target_entity_type,
  } = location.query;

  return {
    source: parseEntry(source_entity_id, source_entity_type),
    target: parseEntry(target_entity_id, target_entity_type),
  };
}

function parseEntry(
  entityId: unknown,
  entityType: unknown,
): ReplaceSourceEntry | undefined {
  const id = Urls.parseNumberParam(entityId);
  const type = Urls.parseEnumParam(entityType, REPLACE_SOURCE_ENTITY_TYPES);
  return id != null && type != null ? { id, type } : undefined;
}
