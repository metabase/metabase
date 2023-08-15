import userEvent from "@testing-library/user-event";
import { getIcon, queryIcon, screen } from "__support__/ui";

import { setup } from "./setup";

describe("SnippetSidebar (EE no token)", () => {
  beforeEach(async () => {
    await setup({ hasEnterprisePlugins: true });
  });

  it("should not display the `Change permissions` menu", () => {
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` but not the `New folder` option", async () => {
    userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.queryByText("New folder")).not.toBeInTheDocument();
  });
});
