import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MainNavSharedCollections } from "./MainNavSharedCollections";

const MOCK_TENANT_COLLECTIONS = [
  createMockCollection({
    id: 1,
    name: "Tenant Collection 1",
    namespace: "shared-tenant-collection",
  }),
];

const setup = ({
  isAdmin = false,
  tenantCollections = MOCK_TENANT_COLLECTIONS,
  currentUser = createMockUser({ is_superuser: isAdmin }),
  rootCollectionCanWrite = false,
}: {
  isAdmin?: boolean;
  tenantCollections?: Collection[];
  currentUser?: ReturnType<typeof createMockUser>;
  rootCollectionCanWrite?: boolean;
} = {}) => {
  const settings = mockSettings({ "use-tenants": true });
  setupCollectionsEndpoints({ collections: tenantCollections });

  // Mock the root shared collection endpoint
  fetchMock.get(
    "path:/api/collection/root",
    (url) => {
      const urlObj = new URL(url, "http://localhost");
      if (urlObj.searchParams.get("namespace") === "shared-tenant-collection") {
        return createMockCollection({
          id: "root",
          name: "Root shared collection",
          namespace: "shared-tenant-collection",
          can_write: rootCollectionCanWrite,
        });
      }
      return 404;
    },
    { overwriteRoutes: false },
  );

  renderWithProviders(<MainNavSharedCollections />, {
    storeInitialState: createMockState({ settings, currentUser }),
  });
};

describe("MainNavSharedCollections > create shared tenant collection button", () => {
  it("shows the create button for admin users", async () => {
    setup({ isAdmin: true });
    await screen.findByText("External collections");

    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("hides the create button for non-admin users", async () => {
    setup({ isAdmin: false });
    await screen.findByText("External collections");

    expect(
      screen.queryByRole("button", { name: /add/i }),
    ).not.toBeInTheDocument();
  });
});

describe("MainNavSharedCollections > section visibility", () => {
  it("shows the section for admins when there are no collections", async () => {
    setup({ isAdmin: true, tenantCollections: [] });

    expect(await screen.findByText("External collections")).toBeInTheDocument();
  });

  it("shows the section for non-admins when some collections exist", async () => {
    setup({ isAdmin: false, tenantCollections: MOCK_TENANT_COLLECTIONS });

    expect(await screen.findByText("External collections")).toBeInTheDocument();
  });

  it("hides the section for non-admins when there are no collections", () => {
    setup({ isAdmin: false, tenantCollections: [] });

    expect(screen.queryByText("External collections")).not.toBeInTheDocument();
  });

  it("hides the section for non-admins when collections exist but are filtered out by permissions", () => {
    const settings = mockSettings({ "use-tenants": true });
    const currentUser = createMockUser({ is_superuser: false });

    // List endpoint has some collections (exists in the DB)
    fetchMock.get("path:/api/collection", () => MOCK_TENANT_COLLECTIONS);

    // Tree endpoint returns an empty array as it is filtered by permissions
    fetchMock.get("path:/api/collection/tree", () => []);

    // Root collection endpoint - user cannot write
    fetchMock.get("path:/api/collection/root", (url) => {
      const urlObj = new URL(url, "http://localhost");
      if (urlObj.searchParams.get("namespace") === "shared-tenant-collection") {
        return createMockCollection({
          id: "root",
          name: "Root shared collection",
          namespace: "shared-tenant-collection",
          can_write: false,
        });
      }
      return 404;
    });

    renderWithProviders(<MainNavSharedCollections />, {
      storeInitialState: createMockState({ settings, currentUser }),
    });

    expect(screen.queryByText("External collections")).not.toBeInTheDocument();
  });

  it("shows the section for non-admins when they can create shared collections (curate permission on root tenant collection)", async () => {
    setup({
      isAdmin: false,
      tenantCollections: [],
      rootCollectionCanWrite: true,
    });

    expect(await screen.findByText("External collections")).toBeInTheDocument();
  });

  it("hides the section for non-admins when they cannot create shared collections and have no visible collections", () => {
    setup({
      isAdmin: false,
      tenantCollections: [],
      rootCollectionCanWrite: false,
    });

    expect(screen.queryByText("External collections")).not.toBeInTheDocument();
  });
});
