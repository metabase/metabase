import React from "react";
import { render, screen } from "@testing-library/react";
import Collections from "./Collections";

it("sanity check", () => {
  render(
    <Collections
      collectionId={1}
      currentUserId={1}
      list={{}}
      onClose={() => {}}
      onOpen={() => {}}
      openCollections={[]}
    />,
  );

  screen.debug();
});
