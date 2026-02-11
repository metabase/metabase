import register from "metabase/visualizations/register";

import { getIcon } from "./icon";

describe("getIcon", () => {
  beforeAll(() => {
    // visualizations are weird and we have to register them before we can use them
    register();
  });

  it("should return the correct icon for a collection", () => {
    expect(getIcon({ model: "collection" })).toEqual({ name: "folder" });
  });

  it("should return the correct icon for a database", () => {
    expect(getIcon({ model: "database" })).toEqual({ name: "database" });
  });

  it("should return the correct icon for a schema", () => {
    expect(getIcon({ model: "schema" })).toEqual({ name: "folder_database" });
  });

  it("should return the correct icon for a table", () => {
    expect(getIcon({ model: "table" })).toEqual({ name: "table" });
  });

  it("should return the correct icon for a model/dataset", () => {
    expect(getIcon({ model: "dataset" })).toEqual({ name: "model" });
  });

  it("should return the correct icon for an action", () => {
    expect(getIcon({ model: "action" })).toEqual({ name: "bolt" });
  });

  it("should return the correct icon for an indexed entity", () => {
    expect(getIcon({ model: "indexed-entity" })).toEqual({ name: "index" });
  });

  it("should return the correct icon for a python library", () => {
    expect(getIcon({ model: "pythonlibrary" })).toEqual({ name: "code_block" });
  });

  it("should return the correct icon for a dashboard", () => {
    expect(getIcon({ model: "dashboard" })).toEqual({ name: "dashboard" });
  });

  it("should return the correct icon for a card without a display type", () => {
    expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
  });

  it("should return the default icon for an invalid model", () => {
    // @ts-expect-error testing invalid model
    expect(getIcon({ model: "pikachu" })).toEqual({ name: "unknown" });
  });

  describe("card display types", () => {
    it("should return the default icon for an invalid display type", () => {
      // @ts-expect-error testing invalid display type
      expect(getIcon({ model: "card", display: "pikachu" })).toEqual({
        name: "table2",
      });
    });

    it("should return the default icon for no display type", () => {
      expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
    });

    it("should return the correct icon for a card with a table chart", () => {
      expect(getIcon({ model: "card", display: "table" })).toEqual({
        name: "table2",
      });
    });

    it("should return the correct icon for a card with a bar chart", () => {
      expect(getIcon({ model: "card", display: "bar" })).toEqual({
        name: "bar",
      });
    });

    it("should return the correct icon for a card with a pie chart", () => {
      expect(getIcon({ model: "card", display: "pie" })).toEqual({
        name: "pie",
      });
    });

    it("should return the correct icon for a card with a line chart", () => {
      expect(getIcon({ model: "card", display: "line" })).toEqual({
        name: "line",
      });
    });

    it("should return the correct icon for a card with a row chart", () => {
      expect(getIcon({ model: "card", display: "row" })).toEqual({
        name: "horizontal_bar",
      });
    });

    it("should return the correct icon for a card with a funnel chart", () => {
      expect(getIcon({ model: "card", display: "funnel" })).toEqual({
        name: "funnel",
      });
    });

    it("should return the correct icon for a card with a map chart", () => {
      expect(getIcon({ model: "card", display: "map" })).toEqual({
        name: "pinmap",
      });
    });

    it("should return the correct icon for a personal collection root", () => {
      expect(
        getIcon({ model: "collection", is_personal: true, location: "/" }),
      ).toEqual({
        name: "person",
      });
    });

    it("should return the correct icon for a nested personal collection", () => {
      expect(
        getIcon({
          model: "collection",
          is_personal: true,
          location: "/123/456",
        }),
      ).toEqual({
        name: "folder",
      });
    });

    it("should return the correct icon for all personal collections", () => {
      expect(getIcon({ model: "collection", id: "personal" })).toEqual({
        name: "group",
      });
    });

    it("should return the correct icon for a card with an object detail chart", () => {
      expect(getIcon({ model: "card", display: "object" })).toEqual({
        name: "document",
      });
    });
  });
});
