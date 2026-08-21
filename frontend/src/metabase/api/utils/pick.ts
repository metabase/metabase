import type { UpdateDashboardRequest } from "metabase-types/api";

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

export function pick<T extends object, const K extends KeysOfUnion<T> & string>(
  object: T,
  keys: readonly K[],
) {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(object, key)) {
      result[key] = object[key];
    }
  }
  return result;
}

export function pickUpdateDashboardRequest(request: UpdateDashboardRequest) {
  return {
    ...pick(request, [
      "collection_position",
      "caveats",
      "position",
      "parameters",
      "description",
      "archived",
      "auto_apply_filters",
      "show_in_getting_started",
      "enable_embedding",
      "embedding_type",
      "collection_id",
      "name",
      "width",
      "embedding_params",
      "cache_ttl",
    ]),
    dashcards: request.dashcards?.map((dashcard) => ({
      ...pick(dashcard, [
        "id",
        "size_x",
        "size_y",
        "row",
        "col",
        "card_id",
        "action_id",
        "dashboard_tab_id",
        "parameter_mappings",
        "visualization_settings",
        "inline_parameters",
      ]),
      series:
        "series" in dashcard
          ? dashcard.series?.map((series) => ({
              id: series.id,
            }))
          : undefined,
    })),
    tabs: request.tabs?.map((tab) => ({
      ...pick(tab, ["id", "name", "position"]),
    })),
  };
}
