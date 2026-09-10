import { ACCOUNTS_CATALOG } from "../../generators/__fixtures__/catalogs";

import {
  type CardDraft,
  canUseSecondDimension,
  createEmptyDraft,
  draftToCard,
  getSecondDimensionOptions,
  getSupportedDimensions,
  normalizeDraft,
} from "./utils";

const CATALOG = ACCOUNTS_CATALOG;
const ACCOUNTS = { measureId: 1, segmentIds: [] };
const AVERAGE_SEATS = { measureId: 3, segmentIds: [] };

const draft = (overrides: Partial<CardDraft> = {}): CardDraft => ({
  series: [ACCOUNTS],
  dimensionKeys: [],
  display: "scalar",
  ...overrides,
});

describe("CardEditorModal utils", () => {
  describe("createEmptyDraft", () => {
    it("starts with the first measure and no dimension", () => {
      expect(createEmptyDraft(CATALOG)).toEqual(draft());
    });

    it("returns null without measures", () => {
      expect(createEmptyDraft({ ...CATALOG, measures: [] })).toBeNull();
    });
  });

  describe("getSupportedDimensions", () => {
    it("intersects the dimensions of every series", () => {
      const keys = getSupportedDimensions(CATALOG, [
        ACCOUNTS,
        AVERAGE_SEATS,
      ]).map((d) => d.key);
      expect(keys).not.toContain("field:6");
      expect(keys).toHaveLength(CATALOG.dimensions.length - 1);
    });

    it("is empty when no series resolves to a measure", () => {
      expect(
        getSupportedDimensions(CATALOG, [{ measureId: 999, segmentIds: [] }]),
      ).toEqual([]);
    });
  });

  describe("canUseSecondDimension", () => {
    it("needs exactly one series and a non-geo first dimension", () => {
      expect(canUseSecondDimension(CATALOG, draft())).toBe(false);
      expect(
        canUseSecondDimension(CATALOG, draft({ dimensionKeys: ["field:5"] })),
      ).toBe(false);
      expect(
        canUseSecondDimension(
          CATALOG,
          draft({
            series: [ACCOUNTS, AVERAGE_SEATS],
            dimensionKeys: ["field:1"],
          }),
        ),
      ).toBe(false);
      expect(
        canUseSecondDimension(CATALOG, draft({ dimensionKeys: ["field:1"] })),
      ).toBe(true);
    });
  });

  describe("getSecondDimensionOptions", () => {
    it("lists supported category and boolean dimensions, low cardinality first", () => {
      const options = getSecondDimensionOptions(
        CATALOG,
        draft({ dimensionKeys: ["field:1"] }),
      );
      expect(
        options.map((option) => [option.dimension.key, option.isRecommended]),
      ).toEqual([
        ["field:8", true],
        ["field:4", true],
        ["field:7", true],
      ]);
    });

    it("excludes the first dimension itself", () => {
      const options = getSecondDimensionOptions(
        CATALOG,
        draft({ dimensionKeys: ["field:4"] }),
      );
      expect(options.map((option) => option.dimension.key)).not.toContain(
        "field:4",
      );
    });

    it("ranks high-cardinality categories after recommended ones", () => {
      const catalog = {
        ...CATALOG,
        dimensions: CATALOG.dimensions.map((dimension) =>
          dimension.key === "field:4"
            ? { ...dimension, distinctCount: 500 }
            : dimension,
        ),
      };
      const options = getSecondDimensionOptions(
        catalog,
        draft({ dimensionKeys: ["field:1"] }),
      );
      expect(
        options.map((option) => [option.dimension.key, option.isRecommended]),
      ).toEqual([
        ["field:8", true],
        ["field:7", true],
        ["field:4", false],
      ]);
    });
  });

  describe("normalizeDraft", () => {
    it("drops a first dimension the series no longer support", () => {
      const result = normalizeDraft(
        CATALOG,
        draft({
          series: [ACCOUNTS, AVERAGE_SEATS],
          dimensionKeys: ["field:6"],
          display: "bar",
        }),
      );
      expect(result.dimensionKeys).toEqual([]);
      expect(result.display).toBe("scalar");
    });

    it("drops the second dimension when a second series is added", () => {
      const result = normalizeDraft(
        CATALOG,
        draft({
          series: [ACCOUNTS, AVERAGE_SEATS],
          dimensionKeys: ["field:1", "field:4"],
          display: "line",
        }),
      );
      expect(result.dimensionKeys).toEqual(["field:1"]);
      expect(result.display).toBe("line");
    });

    it("drops the second dimension when the first becomes geo", () => {
      const result = normalizeDraft(
        CATALOG,
        draft({ dimensionKeys: ["field:5", "field:4"], display: "map" }),
      );
      expect(result.dimensionKeys).toEqual(["field:5"]);
    });

    it("resets a display that is invalid for the dimension type", () => {
      expect(
        normalizeDraft(
          CATALOG,
          draft({ dimensionKeys: ["field:1"], display: "scatter" }),
        ).display,
      ).toBe("line");
      expect(
        normalizeDraft(
          CATALOG,
          draft({ dimensionKeys: ["field:5"], display: "scalar" }),
        ).display,
      ).toBe("map");
    });

    it("keeps a valid draft unchanged", () => {
      const valid = draft({
        dimensionKeys: ["field:1", "field:4"],
        display: "area",
      });
      expect(normalizeDraft(CATALOG, valid)).toEqual(valid);
    });
  });

  it("draftToCard marks the card as custom", () => {
    expect(draftToCard(draft(), "card-id")).toEqual({
      id: "card-id",
      kind: "custom",
      ...draft(),
    });
  });
});
