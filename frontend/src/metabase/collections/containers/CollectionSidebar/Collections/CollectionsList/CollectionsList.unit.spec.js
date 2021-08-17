import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import CollectionsList from "./CollectionsList";

const filter = () => true;

const openCollections = [];

describe("CollectionsList", () => {
  it("renders a basic collection", () => {
    const collections = [
      {
        archived: false,
        children: [],
        id: 1,
        location: "/",
        name: "Collection name",
      },
    ];

    render(
      <DragDropContextProvider backend={HTML5Backend}>
        <CollectionsList
          collections={collections}
          filter={filter}
          openCollections={openCollections}
        />
      </DragDropContextProvider>,
    );

    screen.getByText("Collection name");
  });

  it("opens child collection when user clicks on chevron button", () => {
    const parentCollection = {
      archived: false,
      children: [],
      id: 1,
      location: "/",
      name: "Parent collection name",
    };

    const childCollection = {
      archived: false,
      children: [],
      id: 2,
      location: "/2/",
      name: "Child collection name",
    };

    parentCollection.children = [childCollection];

    const onOpen = jest.fn();

    render(
      <DragDropContextProvider backend={HTML5Backend}>
        <CollectionsList
          collections={[parentCollection]}
          filter={filter}
          onOpen={onOpen}
          openCollections={openCollections}
        />
      </DragDropContextProvider>,
    );

    const chevronButton = screen.getByLabelText("chevronright icon");
    fireEvent.click(chevronButton);

    expect(onOpen).toHaveBeenCalled();
  });
});
