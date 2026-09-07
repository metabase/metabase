import { getChangedFilterDimension } from "./analytics";

const BASE_OPTIONS = {
  entityTypes: ["card", "dashboard"],
  includePersonalCollections: false,
};

describe("getChangedFilterDimension", () => {
  it("reports an entity type being dropped", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["card"],
      }),
    ).toBe("entity_type");
  });

  it("reports an entity type being added", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["card", "dashboard", "document"],
      }),
    ).toBe("entity_type");
  });

  it("reports the personal collections toggle", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        includePersonalCollections: true,
      }),
    ).toBe("personal_collections");
  });

  it("reports whichever numeric threshold the tab owns", () => {
    expect(
      getChangedFilterDimension(
        { ...BASE_OPTIONS, thresholdDays: 30 },
        { ...BASE_OPTIONS, thresholdDays: 90 },
      ),
    ).toBe("threshold");

    expect(
      getChangedFilterDimension(
        { ...BASE_OPTIONS, minDurationMs: 1000 },
        { ...BASE_OPTIONS, minDurationMs: 5000 },
      ),
    ).toBe("threshold");
  });

  it("reports a threshold that was cleared", () => {
    expect(
      getChangedFilterDimension(
        { ...BASE_OPTIONS, thresholdDays: 30 },
        { ...BASE_OPTIONS, thresholdDays: undefined },
      ),
    ).toBe("threshold");
  });

  it("returns null when nothing changed, so no event is sent", () => {
    expect(
      getChangedFilterDimension(
        { ...BASE_OPTIONS, thresholdDays: 30 },
        { ...BASE_OPTIONS, thresholdDays: 30 },
      ),
    ).toBeNull();
  });

  it("does not mistake entity type order for a change", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["card", "dashboard"],
      }),
    ).toBeNull();
  });
});
