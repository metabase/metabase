import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

import CollectionsList from "./CollectionsList";

describe("CollectionsList", () => {
  function setup({ collections = [], openCollections = [], ...props } = {}) {
    render(
      <DragDropContextProvider backend={HTML5Backend}>
        <CollectionsList
          collections={collections}
          openCollections={openCollections}
          filter={() => true}
          {...props}
        />
      </DragDropContextProvider>,
    );
  }

  function collection({
    id,
    name = "Collection name",
    authority_level = null,
    location = "/",
    children = [],
    archived = false,
  } = {}) {
    return {
      id,
      name,
      authority_level,
      location,
      children,
      archived,
    };
  }

  it("renders a basic collection", () => {
    setup({
      collections: [collection({ id: 1, name: "Collection name" })],
    });

    expect(screen.queryByText("Collection name")).toBeVisible();
  });

  it("opens child collection when user clicks on chevron button", () => {
    const onOpen = jest.fn();
    setup({
      collections: [
        collection({
          id: 1,
          name: "Parent collection name",
          children: [
            collection({
              id: 2,
              name: "Child collection name",
              location: "/2/",
            }),
          ],
        }),
      ],
      onOpen,
    });

    userEvent.click(screen.getByLabelText("chevronright icon"));

    expect(onOpen).toHaveBeenCalled();
  });

  describe("Collection types", () => {
    const regularCollection = collection({ id: 1, authority_level: null });
    const officialCollection = collection({
      id: 1,
      authority_level: "official",
    });

    describe("OSS", () => {
      it("displays folder icon for regular collections", () => {
        setup({ collections: [regularCollection] });
        expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
        expect(screen.queryByLabelText("badge icon")).toBeNull();
      });

      it("displays folder icon for official collections", () => {
        setup({ collections: [officialCollection] });
        expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
        expect(screen.queryByLabelText("badge icon")).toBeNull();
      });
    });

    describe("EE", () => {
      const ORIGINAL_COLLECTIONS_PLUGIN = {
        ...PLUGIN_COLLECTIONS,
      };

      beforeAll(() => {
        PLUGIN_COLLECTIONS.isRegularCollection = c => !c.authority_level;
        PLUGIN_COLLECTIONS.AUTHORITY_LEVEL = {
          ...ORIGINAL_COLLECTIONS_PLUGIN,
          official: {
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

      it("displays folder icon for regular collections", () => {
        setup({ collections: [regularCollection] });
        expect(screen.queryByLabelText("folder icon")).toBeInTheDocument();
        expect(screen.queryByLabelText("badge icon")).toBeNull();
      });

      it("displays badge icon for official collections", () => {
        setup({ collections: [officialCollection] });
        expect(screen.queryByLabelText("folder icon")).toBeNull();
        expect(screen.queryByLabelText("badge icon")).toBeInTheDocument();
      });
    });
  });
});
