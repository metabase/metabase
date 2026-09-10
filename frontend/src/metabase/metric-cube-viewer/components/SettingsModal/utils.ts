import { t } from "ttag";
import * as Yup from "yup";

import type { DimensionType } from "metabase/common/metrics/utils/dimension-types";
import type { ComboboxItem } from "metabase/ui";

import type {
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
} from "../../types";

/** Multi-select values are strings; measure ids are converted on submit. */
export interface SettingsFormValues {
  measureIds: string[];
  dimensionKeys: string[];
  filterDimensionKeys: string[];
}

export interface DimensionOptionGroup {
  group: string;
  items: ComboboxItem[];
}

const DIMENSION_TYPE_ORDER: readonly DimensionType[] = [
  "time",
  "category",
  "boolean",
  "geo",
  "numeric",
];

export function getDimensionTypeLabel(type: DimensionType): string {
  switch (type) {
    case "time":
      return t`Time`;
    case "category":
      return t`Category`;
    case "boolean":
      return t`Boolean`;
    case "geo":
      return t`Location`;
    case "numeric":
      return t`Number`;
  }
}

export function toSettingsFormValues(
  settings: CubeCoarseSettings,
): SettingsFormValues {
  return {
    measureIds: settings.measureIds.map(String),
    dimensionKeys: [...settings.dimensionKeys],
    filterDimensionKeys: [...settings.filterDimensionKeys],
  };
}

export function toCoarseSettings(
  values: SettingsFormValues,
  catalog: CubeCatalog,
): CubeCoarseSettings {
  const selected = new Set(values.measureIds);
  return {
    measureIds: catalog.measures
      .filter((measure) => selected.has(String(measure.id)))
      .map((measure) => measure.id),
    dimensionKeys: values.dimensionKeys,
    filterDimensionKeys: values.filterDimensionKeys,
  };
}

export function getMeasureOptions(catalog: CubeCatalog): ComboboxItem[] {
  return [...catalog.measures]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((measure) => ({ value: String(measure.id), label: measure.name }));
}

/** Options sorted by label and grouped by dimension type. */
export function getDimensionOptionGroups(
  dimensions: CubeDimension[],
): DimensionOptionGroup[] {
  const sorted = [...dimensions].sort((a, b) => a.label.localeCompare(b.label));
  return DIMENSION_TYPE_ORDER.flatMap((type) => {
    const items = sorted
      .filter((dimension) => dimension.type === type)
      .map((dimension) => ({ value: dimension.key, label: dimension.label }));
    return items.length > 0
      ? [{ group: getDimensionTypeLabel(type), items }]
      : [];
  });
}

export function getSettingsValidationSchema() {
  return Yup.object({
    measureIds: Yup.array()
      .of(Yup.string().required())
      .min(1, t`Select at least one measure`),
    dimensionKeys: Yup.array().of(Yup.string().required()),
    filterDimensionKeys: Yup.array().of(Yup.string().required()),
  });
}
