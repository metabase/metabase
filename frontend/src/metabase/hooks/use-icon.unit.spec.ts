import { renderHook } from "@testing-library/react";

import register from "metabase/visualizations/register";

import { useGetIcon } from "./use-icon";

describe("useGetIcon", () => {
  beforeAll(() => {
    register();
  });

  const createGetIcon = () => {
    const { result } = renderHook(() => useGetIcon());
    return result.current;
  };

  it("should return the correct icon for a collection", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "collection" })).toEqual({ name: "folder" });
  });

  it("should return the correct icon for a database", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "database" })).toEqual({ name: "database" });
  });

  it("should return the correct icon for a schema", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "schema" })).toEqual({ name: "folder_database" });
  });

  it("should return the correct icon for a table", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "table" })).toEqual({ name: "table" });
  });

  it("should return the correct icon for a model/dataset", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "dataset" })).toEqual({ name: "model" });
  });

  it("should return the correct icon for an action", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "action" })).toEqual({ name: "bolt" });
  });

  it("should return the correct icon for an indexed entity", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "indexed-entity" })).toEqual({ name: "index" });
  });

  it("should return the correct icon for a python library", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "pythonlibrary" })).toEqual({
      name: "code_block",
    });
  });

  it("should return the correct icon for a dashboard", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "dashboard" })).toEqual({ name: "dashboard" });
  });

  it("should return the correct icon for a card without a display type", () => {
    const getIcon = createGetIcon();
    expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
  });

  it("should return the default icon for an invalid model", () => {
    const getIcon = createGetIcon();
    // @ts-expect-error testing invalid model
    expect(getIcon({ model: "pikachu" })).toEqual({ name: "unknown" });
  });

  describe("card display types", () => {
    it("should return the default icon for an invalid display type", () => {
      const getIcon = createGetIcon();
      expect(
        // @ts-expect-error testing invalid display type
        getIcon({ model: "card", display: "pikachu" }),
      ).toEqual({
        name: "table2",
      });
    });

    it("should return the default icon for no display type", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
    });

    it("should return the correct icon for a card with a table chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "table" })).toEqual({
        name: "table2",
      });
    });

    it("should return the correct icon for a card with a bar chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "bar" })).toEqual({
        name: "bar",
      });
    });

    it("should return the correct icon for a card with a pie chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "pie" })).toEqual({
        name: "pie",
      });
    });

    it("should return the correct icon for a card with a line chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "line" })).toEqual({
        name: "line",
      });
    });

    it("should return the correct icon for a card with a row chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "row" })).toEqual({
        name: "horizontal_bar",
      });
    });

    it("should return the correct icon for a card with a funnel chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "funnel" })).toEqual({
        name: "funnel",
      });
    });

    it("should return the correct icon for a card with a map chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "map" })).toEqual({
        name: "pinmap",
      });
    });

    it("should return the correct icon for a personal collection root", () => {
      const getIcon = createGetIcon();
      expect(
        getIcon({ model: "collection", is_personal: true, location: "/" }),
      ).toEqual({
        name: "person",
      });
    });

    it("should return the correct icon for a nested personal collection", () => {
      const getIcon = createGetIcon();
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
      const getIcon = createGetIcon();
      expect(getIcon({ model: "collection", id: "personal" })).toEqual({
        name: "group",
      });
    });

    it("should return the correct icon for a card with an object detail chart", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "object" })).toEqual({
        name: "document",
      });
    });
  });
});
