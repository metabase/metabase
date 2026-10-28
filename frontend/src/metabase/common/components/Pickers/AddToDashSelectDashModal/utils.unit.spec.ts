import { PLUGIN_LIBRARY, reinitialize } from "metabase/plugins";

import type { OmniPickerItem } from "../EntityPicker";

import { isInLibrary } from "./utils";

const libraryDashboardsCollection = {
  id: 2,
  name: "Dashboards",
  authority_level: null,
  type: "library-dashboards",
};

describe("isInLibrary", () => {
  beforeEach(() => {
    PLUGIN_LIBRARY.isLibraryCollectionType = (type) =>
      type === "library" || type === "library-dashboards";
  });

  afterEach(() => {
    reinitialize();
  });

  it.each<{ name: string; item: OmniPickerItem; expected: boolean }>([
    {
      name: "a library collection",
      item: { id: 1, name: "Library", model: "collection", type: "library" },
      expected: true,
    },
    {
      name: "a regular collection",
      item: { id: 1, name: "Regular", model: "collection", type: null },
      expected: false,
    },
    {
      name: "a dashboard in a library collection",
      item: {
        id: 3,
        name: "D",
        model: "dashboard",
        collection: libraryDashboardsCollection,
      },
      expected: true,
    },
    {
      name: "a dashboard in a collection without a type",
      item: {
        id: 3,
        name: "D",
        model: "dashboard",
        collection: { id: 4, name: "Regular", authority_level: null },
      },
      expected: false,
    },
  ])("should return $expected for $name", ({ item, expected }) => {
    expect(isInLibrary(item)).toBe(expected);
  });
});
