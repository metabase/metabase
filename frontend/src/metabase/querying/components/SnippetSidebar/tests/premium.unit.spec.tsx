import userEvent from "@testing-library/user-event";

import { getIcon, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

async function setup(options: SetupOpts = {}) {
  return await baseSetup({
    enterprisePlugins: ["snippets"],
    tokenFeatures: { snippet_collections: true },
    ...options,
  });
}

describe("SnippetSidebar (EE with token feature)", () => {
  beforeEach(() => {
    reinitialize();
  });

  it("should display the `Change permissions` menu for admin users", async () => {
    await setup();

    expect(getIcon("ellipsis")).toBeInTheDocument();
  });

  it("should not display the `Change permissions` menu for non-admin users", async () => {
    await setup({ user: { is_superuser: false } });
    await userEvent.click(getIcon("ellipsis"));

    expect(screen.queryByText("Change permissions")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` and the `New folder` option", async () => {
    await setup();
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
  });

  it("should open the collection modal when creating a new folder", async () => {
    const { store } = await setup();

    await userEvent.click(getIcon("add"));
    await userEvent.click(await screen.findByText("New folder"));

    expect(store.getState().modal).toMatchObject({
      id: "collection",
      props: {
        initialCollectionId: null,
        namespaces: ["snippets"],
        showAuthorityLevelPicker: false,
        shouldNavigateOnCreate: false,
      },
    });
  });
});
