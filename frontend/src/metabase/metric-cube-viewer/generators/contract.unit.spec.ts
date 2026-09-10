import { FIXTURE_CATALOGS } from "./__fixtures__/catalogs";
import { getContractViolations } from "./contract";
import { CARD_GENERATORS } from "./registry";
import type { CubeCatalog, CubeCoarseSettings } from "./types";

const selectEverything = (catalog: CubeCatalog): CubeCoarseSettings => ({
  measureIds: catalog.measures.map((m) => m.id),
  dimensionKeys: catalog.dimensions.map((d) => d.key),
  filterDimensionKeys: catalog.dimensions.map((d) => d.key),
});

describe("card generator contract", () => {
  const fixtures = Object.entries(FIXTURE_CATALOGS);

  it("has at least one registered generator and one fixture", () => {
    expect(CARD_GENERATORS.length).toBeGreaterThan(0);
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(CARD_GENERATORS.map((generator) => [generator.id, generator]))(
    "%s",
    (_id, generator) => {
      it.each(fixtures)(
        "holds for the %s fixture with default settings",
        (_name, catalog) => {
          expect(getContractViolations(generator, catalog)).toEqual([]);
        },
      );

      it.each(fixtures)(
        "holds for the %s fixture with everything selected",
        (_name, catalog) => {
          expect(
            getContractViolations(
              generator,
              catalog,
              selectEverything(catalog),
            ),
          ).toEqual([]);
        },
      );
    },
  );
});
