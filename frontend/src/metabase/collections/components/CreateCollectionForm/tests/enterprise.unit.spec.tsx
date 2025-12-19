import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("CreateCollectionForm", () => {
  it("does not show authority level controls", () => {
    setup();
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });
});
