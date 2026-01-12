import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";
// TODO remove this and use proper reset functions once
// plugins initialization functions return proper teardown functions
// eslint-disable-next-line no-restricted-imports
import { resetPlugin } from "metabase-enterprise/snippets";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

async function setup(options: SetupOpts = {}) {
  await baseSetup({
    enterprisePlugins: ["snippets"],
    tokenFeatures: { snippet_collections: true },
    ...options,
  });
}

describe("SnippetSidebar (EE with token feature)", () => {
  beforeEach(() => {
    resetPlugin();
  });

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
