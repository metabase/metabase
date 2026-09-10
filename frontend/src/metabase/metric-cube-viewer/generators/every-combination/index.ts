// Minimal example variant: every selected measure × every selected dimension,
// no segments, no scoring.
import {
  DEFAULT_DISPLAY_BY_TYPE,
  makeCard,
  overviewCard,
  resolveSettings,
} from "../shared";
import type { CardGenerator, CubeCard } from "../types";

const DEFAULT_MEASURE_COUNT = 3;
const DEFAULT_DIMENSION_COUNT = 4;
/** Cards per generation, excluding overview cards. */
const MAX_CARDS = 24;

export const everyCombinationGenerator: CardGenerator = {
  id: "every-combination",
  name: "Every combination",
  description: "Overview numbers plus one card per measure × dimension.",
  getDefaultSettings: (catalog) => ({
    measureIds: catalog.measures
      .slice(0, DEFAULT_MEASURE_COUNT)
      .map((m) => m.id),
    dimensionKeys: catalog.dimensions
      .slice(0, DEFAULT_DIMENSION_COUNT)
      .map((d) => d.key),
    filterDimensionKeys: [],
  }),
  generateCards: (catalog, settings) => {
    const { measures, dimensions } = resolveSettings(
      catalog,
      settings.measureIds,
      settings.dimensionKeys,
    );
    const combinations: CubeCard[] = measures.flatMap((measure) =>
      dimensions
        .filter((dimension) => measure.dimensionIds[dimension.key] != null)
        .map((dimension) =>
          makeCard(
            "single",
            [{ measureId: measure.id, segmentIds: [] }],
            [dimension.key],
            DEFAULT_DISPLAY_BY_TYPE[dimension.type],
          ),
        ),
    );
    return [...measures.map(overviewCard), ...combinations.slice(0, MAX_CARDS)];
  },
};
