/* eslint-disable react/prop-types */
import React from "react";
import { render, screen } from "@testing-library/react";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import SearchResult from "./SearchResult";

function collection({
  id = 1,
  name = "Marketing",
  authority_level = null,
  getIcon = () => ({ name: "folder" }),
  getUrl = () => `/collection/${id}`,
  getCollection = () => {},
} = {}) {
  const collection = {
    id,
    name,
    authority_level,
    getIcon,
    getUrl,
    getCollection,
    model: "collection",
  };
  collection.collection = collection;
  return collection;
}

describe("SearchResult > Collections", () => {
  const regularCollection = collection();

  describe("OSS", () => {
    const officialCollection = collection({
      authority_level: "official",
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={regularCollection} />);
      expect(screen.queryByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.queryByText("Collection")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).toBeNull();
    });

    it("renders official collections as regular", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.queryByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.queryByText("Collection")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).toBeNull();
    });
  });

  describe("EE", () => {
    const officialCollection = collection({
      authority_level: "official",
      getIcon: () => ({ name: "badge" }),
    });

    const ORIGINAL_COLLECTIONS_PLUGIN = { ...PLUGIN_COLLECTIONS };

    beforeAll(() => {
      PLUGIN_COLLECTIONS.isRegularCollection = c => !c.authority_level;
      PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = {
        ...ORIGINAL_COLLECTIONS_PLUGIN.AUTHORITY_LEVEL,
        official: {
          name: "Official",
          icon: "badge",
        },
      };
    });

    afterAll(() => {
      PLUGIN_COLLECTIONS.isRegularCollection =
        ORIGINAL_COLLECTIONS_PLUGIN.isRegularCollection;
      PLUGIN_COLLECTIONS.AUTHORITY_LEVEL =
        ORIGINAL_COLLECTIONS_PLUGIN.AUTHORITY_LEVEL;
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={regularCollection} />);
      expect(screen.queryByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.queryByText("Collection")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).toBeNull();
    });

    it("renders official collections correctly", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.queryByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.queryByText("Official Collection")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).toBeNull();
    });
  });
});
