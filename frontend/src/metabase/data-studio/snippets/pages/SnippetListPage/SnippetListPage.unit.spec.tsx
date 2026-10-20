import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { dataStudioArchivedSnippets } from "metabase/urls";
import type { User } from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { SnippetListPage } from "./SnippetListPage";

type SetupOpts = {
  isEnterprise?: boolean;
  user?: Partial<User>;
};

const NATIVE_WRITE_USER: Partial<User> = {
  permissions: { can_create_native_queries: true },
};

function setup({ isEnterprise = false, user = NATIVE_WRITE_USER }: SetupOpts) {
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({ id: "root", name: "Root", namespace: "snippets" }),
      createMockCollection({
        id: 10,
        name: "Revenue folder",
        namespace: "snippets",
        location: "/",
        parent_id: null,
      }),
    ],
  });
  setupNativeQuerySnippetEndpoints({
    snippets: [
      createMockNativeQuerySnippet({
        id: 1,
        name: "Orders filter",
        collection_id: null,
      }),
      createMockNativeQuerySnippet({
        id: 2,
        name: "Revenue sum",
        collection_id: 10,
      }),
    ],
  });
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        snippet_collections: isEnterprise,
      }),
    }),
    currentUser: createMockUser(user),
  });
  if (isEnterprise) {
    setupEnterpriseOnlyPlugin("snippets");
  }

  renderWithProviders(<Route path="/" element={<SnippetListPage />} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

describe("SnippetListPage", () => {
  beforeEach(() => {
    reinitialize();
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists the top-level folders and snippets without a root row", async () => {
    setup({});

    const page = await screen.findByTestId("library-page");
    expect(await within(page).findByText("Orders filter")).toBeInTheDocument();
    expect(within(page).getByText("Revenue folder")).toBeInTheDocument();
    expect(within(page).queryByText("SQL snippets")).not.toBeInTheDocument();
  });

  it("filters snippets by name, including ones in folders", async () => {
    setup({});

    await screen.findByText("Orders filter");
    await userEvent.type(screen.getByPlaceholderText("Search..."), "revenue");

    expect(await screen.findByText("Revenue sum")).toBeInTheDocument();
    expect(screen.queryByText("Orders filter")).not.toBeInTheDocument();
  });

  it("clears a selected nested snippet when Select all is clicked twice", async () => {
    setup({});

    await userEvent.click(await screen.findByText("Revenue folder"));
    const nestedRow = await screen.findByRole("row", { name: /Revenue sum/ });
    await userEvent.click(
      within(nestedRow).getByRole("checkbox", { name: "Select row" }),
    );
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    const selectAll = screen.getByRole("checkbox", { name: "Select all" });
    await userEvent.click(selectAll);
    expect(await screen.findByText("2 items selected")).toBeInTheDocument();
    expect(selectAll).toBeChecked();

    await userEvent.click(selectAll);
    await waitFor(() =>
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument(),
    );
    expect(selectAll).not.toBeChecked();
    expect(selectAll).not.toBePartiallyChecked();
    expect(
      within(screen.getByRole("row", { name: /Revenue sum/ })).getByRole(
        "checkbox",
        { name: "Select row" },
      ),
    ).not.toBeChecked();
  });

  it("offers only new snippets without snippet folders", async () => {
    setup({});

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Snippet"]);
  });

  it("places the page menu after the New button", async () => {
    setup({});

    const newButton = await screen.findByRole("button", { name: /New/ });
    const pageMenuButton = screen.getByRole("button", {
      name: "Snippet options",
    });

    expect(
      newButton.compareDocumentPosition(pageMenuButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers new snippets and folders with snippet folders", async () => {
    setup({ isEnterprise: true });

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Snippet", "Folder"]);
  });

  it("does not offer to create anything without native write access", async () => {
    setup({ user: {} });

    expect(await screen.findByText("Orders filter")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the permissions of the snippets collection from the page menu", async () => {
    setupGroupsEndpoint([]);
    setupCollectionPermissionsGraphEndpoint({ revision: 1, groups: {} });
    setup({
      isEnterprise: true,
      user: { ...NATIVE_WRITE_USER, is_superuser: true },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Snippet options" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Change permissions/ }),
    );

    expect(
      await within(screen.getByRole("dialog")).findByRole("heading", {
        name: "Permissions for Root",
      }),
    ).toBeInTheDocument();
  });

  it("offers only archived snippets without snippet folders", async () => {
    setup({ user: { ...NATIVE_WRITE_USER, is_superuser: true } });

    await userEvent.click(
      await screen.findByRole("button", { name: "Snippet options" }),
    );

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["View archived snippets"]);
    expect(
      screen.getByRole("menuitem", { name: /View archived snippets/ }),
    ).toHaveAttribute("href", dataStudioArchivedSnippets());
  });

  it("does not offer to change permissions to non-admins", async () => {
    setup({ isEnterprise: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Snippet options" }),
    );

    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
  });
});
