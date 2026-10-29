import { renderHook } from "@testing-library/react";

import {
  type VisualizationDefinition,
  registerVisualization,
  setDefaultVisualization,
} from "metabase/viz-core";
import type { IconName, VisualizationDisplay } from "metabase-types/api";

import { useGetIcon } from "./use-icon";

// The hook only reads each registered visualization's iconName,
// so the spec registers stubs instead of the real chart modules from metabase/visualizations.
const createDefinition = (
  identifier: VisualizationDisplay,
  iconName: IconName,
): VisualizationDefinition => ({
  identifier,
  iconName,
  getUiName: () => identifier,
  checkRenderable: () => undefined,
});

const REGISTERED_DEFINITION = createDefinition("funnel", "rocket");
const DEFAULT_DEFINITION = createDefinition("table", "moon");

describe("useGetIcon", () => {
  beforeAll(() => {
    // The registry resolves unknown display types to the default visualization.
    setDefaultVisualization(DEFAULT_DEFINITION);
    registerVisualization(REGISTERED_DEFINITION);
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
    it("should return the registered visualization's icon for a card", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "funnel" })).toEqual({
        name: "rocket",
      });
    });

    it("should fall back to the default visualization's icon for an unknown display", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card", display: "scatter" })).toEqual({
        name: "moon",
      });
    });

    it("should return the default icon for no display type", () => {
      const getIcon = createGetIcon();
      expect(getIcon({ model: "card" })).toEqual({ name: "table2" });
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
  });
});
