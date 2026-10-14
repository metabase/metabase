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
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
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

  it("lists snippets under the SQL snippets root", async () => {
    setup({});

    const page = await screen.findByTestId("library-page");
    expect(await within(page).findByText("Orders filter")).toBeInTheDocument();
    expect(within(page).getByText("SQL snippets")).toBeInTheDocument();
    expect(within(page).getByText("Revenue folder")).toBeInTheDocument();
  });

  it("filters snippets by name, including ones in folders", async () => {
    setup({});

    await screen.findByText("Orders filter");
    await userEvent.type(screen.getByPlaceholderText("Search..."), "revenue");

    expect(await screen.findByText("Revenue sum")).toBeInTheDocument();
    expect(screen.queryByText("Orders filter")).not.toBeInTheDocument();
  });

  it("offers only new snippets without snippet folders", async () => {
    setup({});

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Snippet"]);
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

  it("keeps the root row expanded when clicking inside the permissions modal it opened", async () => {
    setupGroupsEndpoint([]);
    setupCollectionPermissionsGraphEndpoint({ revision: 1, groups: {} });
    setup({
      isEnterprise: true,
      user: { ...NATIVE_WRITE_USER, is_superuser: true },
    });

    expect(await screen.findByText("Orders filter")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Snippet collection options" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Change permissions/ }),
    );
    await userEvent.click(
      await within(screen.getByRole("dialog")).findByRole("heading", {
        name: /Permissions for/,
      }),
    );

    expect(screen.getByText("Orders filter")).toBeInTheDocument();
  });

  it("keeps the root row expanded when clicking inside the root options menu", async () => {
    setup({});

    expect(await screen.findByText("Orders filter")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Snippet collection options" }),
    );
    await userEvent.click(await screen.findByRole("menu"));

    expect(screen.getByText("Orders filter")).toBeInTheDocument();
  });
});
