import register from "metabase/visualizations/register";

import { getIcon } from "./icon";

describe("getIcon", () => {
  beforeAll(() => {
    // visualizations are weird and we have to register them before we can use them
    register();
  });

  it("should return the correct icon for a collection", () => {
    expect(getIcon({ model: "collection" })).toEqual({ icon: "folder" });
  });
  it("should return the correct icon for a database", () => {
    expect(getIcon({ model: "database" })).toEqual({ icon: "database" });
  });
  it("should return the correct icon for a table", () => {
    expect(getIcon({ model: "table" })).toEqual({ icon: "table" });
  });
  it("should return the correct icon for a model/dataset", () => {
    expect(getIcon({ model: "dataset" })).toEqual({ icon: "model" });
  });
  it("should return the correct icon for an action", () => {
    expect(getIcon({ model: "action" })).toEqual({ icon: "bolt" });
  });
  it("should return the correct icon for an indexed entity", () => {
    expect(getIcon({ model: "indexed-entity" })).toEqual({ icon: "index" });
  });
  it("should return the correct icon for a dashboard", () => {
    expect(getIcon({ model: "dashboard" })).toEqual({ icon: "dashboard" });
  });
  it("should return the correct icon for a card without a display type", () => {
    expect(getIcon({ model: "card" })).toEqual({ icon: "table" });
  });
  it("should return the default icon for an invalid model", () => {
    // @ts-expect-error testing invalid model
    expect(getIcon({ model: "pikachu" })).toEqual({ icon: "unknown" });
  });

  describe("card display types", () => {
    it("should return the default icon for an invalid display type", () => {
      expect(getIcon({ model: "card", display: "pikachu" })).toEqual({
        icon: "table",
      });
    });

    it("should return the default icon for no display type", () => {
      expect(getIcon({ model: "card" })).toEqual({ icon: "table" });
    });

    it("should return the correct icon for a card with a table chare", () => {
      expect(getIcon({ model: "card", display: "table" })).toEqual({
        icon: "table",
      });
    });
    it("should return the correct icon for a card with a bar chart", () => {
      expect(getIcon({ model: "card", display: "bar" })).toEqual({
        icon: "bar",
      });
    });
    it("should return the correct icon for a card with a pie chart", () => {
      expect(getIcon({ model: "card", display: "pie" })).toEqual({
        icon: "pie",
      });
    });
    it("should return the correct icon for a card with a line chart", () => {
      expect(getIcon({ model: "card", display: "line" })).toEqual({
        icon: "line",
      });
    });
    it("should return the correct icon for a card with a row chart", () => {
      expect(getIcon({ model: "card", display: "row" })).toEqual({
        icon: "horizontal_bar",
      });
    });
    it("should return the correct icon for a card with a funnel chart", () => {
      expect(getIcon({ model: "card", display: "funnel" })).toEqual({
        icon: "funnel",
      });
    });
    it("should return the correct icon for a card with a map chart", () => {
      expect(getIcon({ model: "card", display: "map" })).toEqual({
        icon: "pinmap",
      });
    });
    it("should return the correct icon for a card with anobject detail chart", () => {
      expect(getIcon({ model: "card", display: "object" })).toEqual({
        icon: "document",
      });
    });
  });
});
