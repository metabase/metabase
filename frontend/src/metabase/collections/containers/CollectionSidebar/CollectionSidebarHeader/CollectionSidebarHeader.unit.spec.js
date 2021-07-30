import React from "react";
import { render, screen } from "@testing-library/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import CollectionSidebarHeader from "./CollectionSidebarHeader";

it("displays link to main collection: Our Analytics", () => {
  render(
    <DragDropContextProvider backend={HTML5Backend}>
      <CollectionSidebarHeader
        isRoot={false}
        root={{ name: "name", id: "root" }}
      />
    </DragDropContextProvider>,
  );

  screen.getByText("Our analytics");
});
