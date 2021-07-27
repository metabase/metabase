import React from "react";
import { render, screen } from "@testing-library/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import RootCollectionLink from "./RootCollectionLink";

it("displays link to main collection: Our Analytics", () => {
  const root = { name: "name", id: "root" };

  render(
    <DragDropContextProvider backend={HTML5Backend}>
      <RootCollectionLink isRoot={false} root={root} />
    </DragDropContextProvider>,
  );

  screen.getByText("Our analytics");
});
