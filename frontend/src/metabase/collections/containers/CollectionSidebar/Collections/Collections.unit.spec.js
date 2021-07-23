import React from "react";
import { render, screen } from "@testing-library/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import Collections from "./Collections";

const name = "A collection name";
const list = [{ name }];

it("displays entries", () => {
  render(
    <DragDropContextProvider backend={HTML5Backend}>
      <Collections
        collectionId={1}
        currentUserId={1}
        list={list}
        onClose={() => {}}
        onOpen={() => {}}
        openCollections={[]}
      />
    </DragDropContextProvider>,
  );

  screen.getByText(name);
});
