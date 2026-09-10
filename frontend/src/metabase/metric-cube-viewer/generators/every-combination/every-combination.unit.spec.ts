import { ACCOUNTS_CATALOG } from "../__fixtures__/catalogs";
import type { CubeCatalog, CubeDimension, CubeMeasure } from "../types";

import { everyCombinationGenerator } from "./index";

const MAX_CARDS = 24;

const generate = (catalog: CubeCatalog) =>
  everyCombinationGenerator.generateCards(
    catalog,
    everyCombinationGenerator.getDefaultSettings(catalog),
  );

describe("everyCombinationGenerator", () => {
  it("emits one overview per selected measure, then one single per supported measure × dimension", () => {
    const settings = {
      measureIds: [3, 2],
      dimensionKeys: ["field:1", "field:6", "field:4"],
      filterDimensionKeys: [],
    };
    const cards = everyCombinationGenerator.generateCards(
      ACCOUNTS_CATALOG,
      settings,
    );

    expect(cards.map((card) => card.kind)).toEqual([
      "overview",
      "overview",
      "single",
      "single",
      "single",
      "single",
    ]);
    // Neither "Average seats" nor "Total seats" supports "Seats" (field:6).
    expect(
      cards
        .filter((card) => card.kind === "single")
        .map((card) => [card.series[0].measureId, card.dimensionKeys[0]]),
    ).toEqual([
      [3, "field:1"],
      [3, "field:4"],
      [2, "field:1"],
      [2, "field:4"],
    ]);
  });

  it("uses the default display for each dimension type", () => {
    const cards = generate(ACCOUNTS_CATALOG);
    const displayByKey = new Map(
      cards
        .filter((card) => card.kind === "single")
        .map((card) => [card.dimensionKeys[0], card.display]),
    );
    expect(displayByKey.get("field:8")).toBe("bar");
    expect(displayByKey.get("field:3")).toBe("line");
    expect(displayByKey.get("field:5")).toBe("map");
  });

  it("caps the combinations, not the overview cards", () => {
    const measures: CubeMeasure[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `Measure ${i + 1}`,
      isAdditive: true,
      dimensionIds: Object.fromEntries(
        Array.from({ length: 6 }, (_, j) => [`field:${j + 1}`, `dim-${j + 1}`]),
      ),
    }));
    const dimensions: CubeDimension[] = Array.from({ length: 6 }, (_, j) => ({
      key: `field:${j + 1}`,
      label: `Dimension ${j + 1}`,
      type: "category",
      score: 0.5,
      distinctCount: 4,
      canListValues: true,
    }));
    const catalog: CubeCatalog = {
      tableId: 1,
      measures,
      dimensions,
      segments: [],
    };
    const cards = everyCombinationGenerator.generateCards(catalog, {
      measureIds: measures.map((m) => m.id),
      dimensionKeys: dimensions.map((d) => d.key),
      filterDimensionKeys: [],
    });

    expect(cards.filter((card) => card.kind === "overview")).toHaveLength(5);
    expect(cards.filter((card) => card.kind === "single")).toHaveLength(
      MAX_CARDS,
    );
  });

  it("ignores unknown ids in settings", () => {
    const cards = everyCombinationGenerator.generateCards(ACCOUNTS_CATALOG, {
      measureIds: [999, 1],
      dimensionKeys: ["field:999", "field:1"],
      filterDimensionKeys: [],
    });
    expect(cards.map((card) => card.id)).toEqual([
      "overview:m1",
      "single:m1:field:1",
    ]);
  });
});
