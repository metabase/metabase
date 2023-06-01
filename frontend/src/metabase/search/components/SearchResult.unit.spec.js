/* eslint-disable react/prop-types */
import { render, screen } from "@testing-library/react";
import { setupEnterpriseTest } from "__support__/enterprise";
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
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });

    it("renders official collections as regular", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    const officialCollection = collection({
      authority_level: "official",
      getIcon: () => ({ name: "badge" }),
    });

    beforeAll(() => {
      setupEnterpriseTest();
    });

    it("renders regular collection correctly", () => {
      render(<SearchResult result={regularCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("badge icon")).not.toBeInTheDocument();
    });

    it("renders official collections correctly", () => {
      render(<SearchResult result={officialCollection} />);
      expect(screen.getByText(regularCollection.name)).toBeInTheDocument();
      expect(screen.getByText("Official Collection")).toBeInTheDocument();
      expect(screen.getByLabelText("badge icon")).toBeInTheDocument();
      expect(screen.queryByLabelText("folder icon")).not.toBeInTheDocument();
    });
  });
});
