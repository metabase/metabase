import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";

import { setup } from "./setup";

describe("SnippetSidebar (EE with token)", () => {
  beforeEach(async () => {
    await setup({
      hasEnterprisePlugins: true,
      tokenFeatures: { content_management: true },
    });
  });

  it("should display the `Change permissions` menu", () => {
    expect(getIcon("ellipsis")).toBeInTheDocument();
  });

  it("should display the `New snippet` and the `New folder` option", async () => {
    userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
  });
});
