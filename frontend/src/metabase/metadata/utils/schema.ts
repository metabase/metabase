import type { SchemaName } from "metabase-types/api";
import { humanize, titleize } from "metabase/utils/formatting";

export function getSchemaDisplayName(schema: SchemaName): string {
  return titleize(humanize(schema));
}
