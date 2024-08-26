import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";

import { setup } from "./setup";

describe("SnippetSidebar (OSS)", () => {
  beforeEach(async () => {
    await setup();
  });

  it("should not display the `Change permissions` menu", () => {
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` but not the `New folder` option", async () => {
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.queryByText("New folder")).not.toBeInTheDocument();
  });
});
