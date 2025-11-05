import { humanize, titleize } from "metabase/lib/formatting";
import type { SchemaName } from "metabase-types/api";

export function getSchemaDisplayName(schema: SchemaName): string {
  return titleize(humanize(schema));
}
