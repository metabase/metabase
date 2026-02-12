import type { ReplaceSourceEntry } from "metabase-types/api";

const BASE_URL = `/data-studio/replace-data-source`;

export type ReplaceDataSourceParams = {
  source?: ReplaceSourceEntry;
  target?: ReplaceSourceEntry;
};

export function replaceDataSource(params: ReplaceDataSourceParams) {
  const searchParams = new URLSearchParams();
  if (params.source) {
    searchParams.set("source_entity_id", String(params.source.id));
    searchParams.set("source_entity_type", params.source.type);
  }
  if (params.target) {
    searchParams.set("target_entity_id", String(params.target.id));
    searchParams.set("target_entity_type", params.target.type);
  }
  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${BASE_URL}?${queryString}` : BASE_URL;
}
