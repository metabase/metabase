import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

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
    location = "/",
    children = [],
    archived = false,
  } = {}) {
    return {
      id,
      name,
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
});
