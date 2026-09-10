// A minimal, transparent generator for component specs: one overview card per
// measure plus one "single" card per (first measure, dimension) pair.
import { makeCard, overviewCard, resolveSettings } from "../generators/shared";
import type { CardGenerator, CubeCatalog } from "../types";

export const TEST_GENERATOR: CardGenerator = {
  id: "test-generator",
  name: "Test generator",
  description: "One card per selected dimension",
  getDefaultSettings: (catalog: CubeCatalog) => ({
    measureIds: catalog.measures.slice(0, 1).map((measure) => measure.id),
    dimensionKeys: catalog.dimensions.slice(0, 1).map((d) => d.key),
    filterDimensionKeys: [],
  }),
  generateCards: (catalog, settings) => {
    const { measures, dimensions } = resolveSettings(
      catalog,
      settings.measureIds,
      settings.dimensionKeys,
    );
    const [firstMeasure] = measures;
    if (!firstMeasure) {
      return [];
    }
    return [
      ...measures.map(overviewCard),
      ...dimensions
        .filter((dimension) => firstMeasure.dimensionIds[dimension.key] != null)
        .map((dimension) =>
          makeCard(
            "single",
            [{ measureId: firstMeasure.id, segmentIds: [] }],
            [dimension.key],
            dimension.type === "time" ? "line" : "bar",
          ),
        ),
    ];
  },
};
