import React from "react";
import { render, screen } from "__support__/ui";

import Collections from "./Collections";

const name = "A collection name";
const list = [{ name }];

it("displays entries", () => {
  render(
    <Collections
      collectionId={1}
      currentUserId={1}
      list={list}
      onClose={() => {}}
      onOpen={() => {}}
      openCollections={[]}
    />,
    { withDND: true },
  );

  screen.getByText(name);
});
