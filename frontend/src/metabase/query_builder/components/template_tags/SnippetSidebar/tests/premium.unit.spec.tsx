import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

async function setup(options: SetupOpts = {}) {
  await baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { snippet_collections: true },
    ...options,
  });
}

describe("SnippetSidebar (EE with token feature)", () => {
  it("should display the `Change permissions` menu for admin users", async () => {
    await setup();

    expect(getIcon("ellipsis")).toBeInTheDocument();
  });

  it("should not display the `Change permissions` menu for non-admin users", async () => {
    await setup({ user: { is_superuser: false } });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` and the `New folder` option", async () => {
    await setup();
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
  });
});
