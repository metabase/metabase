import { t } from "ttag";

import type { IconName, TableDataLayer } from "metabase-types/api";

export const DATA_LAYERS: TableDataLayer[] = ["hidden", "internal", "final"];

export const DATA_LAYER_ICONS: Record<TableDataLayer, IconName> = {
  hidden: "eye_filled",
  internal: "database",
  final: "published",
};

export function getDataLayerLabel(layer: TableDataLayer): string {
  switch (layer) {
    case "hidden":
      return t`Hidden`;
    case "internal":
      return t`Internal`;
    case "final":
      return t`Final`;
  }
}

export function getDataLayerOptions(): {
  value: TableDataLayer;
  label: string;
}[] {
  return DATA_LAYERS.map((value) => ({
    value,
    label: getDataLayerLabel(value),
  }));
}

export function isDataLayer(value: string): value is TableDataLayer {
  return DATA_LAYERS.some((layer) => layer === value);
}
