import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { CollectionPermissions } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockGroup } from "metabase-types/api/mocks/group";

import { TenantCollectionPermissionsPage } from "./TenantCollectionPermissionsPage";

const ALL_INTERNAL_USERS = createMockGroup({
  id: 1,
  name: "All internal users",
  magic_group_type: "all-internal-users",
});

const INTERNAL_GROUP = createMockGroup({
  id: 2,
  name: "Test Internal Group",
  magic_group_type: null,
  is_tenant_group: false,
});

const ALL_TENANT_USERS = createMockGroup({
  id: 3,
  name: "All tenant users",
  magic_group_type: "all-external-users",
  is_tenant_group: true,
});

const TENANT_GROUP = createMockGroup({
  id: 4,
  name: "Test Tenant Group",
  magic_group_type: null,
  is_tenant_group: true,
});

const GROUPS = [
  ALL_INTERNAL_USERS,
  INTERNAL_GROUP,
  ALL_TENANT_USERS,
  TENANT_GROUP,
];

const SHARED_COLLECTION = createMockCollection({
  id: 100,
  name: "Shared reports",
  namespace: "shared-tenant-collection",
  children: [],
});

const ROOT_PERMISSIONS: CollectionPermissions = {
  [ALL_INTERNAL_USERS.id]: { root: "read", [SHARED_COLLECTION.id]: "read" },
  [INTERNAL_GROUP.id]: { root: "read", [SHARED_COLLECTION.id]: "read" },
  [ALL_TENANT_USERS.id]: { root: "read", [SHARED_COLLECTION.id]: "read" },
  [TENANT_GROUP.id]: { root: "read", [SHARED_COLLECTION.id]: "read" },
};

const SETTINGS_STATE = mockSettings({
  "token-features": createMockTokenFeatures({ tenants: true }),
  "use-tenants": true,
});

// The tenant plugin pushes its permission tabs onto a shared slot, so it has to
// be registered exactly once for the whole file.
beforeAll(() => {
  setupEnterprisePlugins();
});

const setup = () => {
  setupCollectionsEndpoints({ collections: [SHARED_COLLECTION] });
  setupCollectionPermissionsGraphEndpoint({
    revision: 1,
    groups: ROOT_PERMISSIONS,
  });
  setupGroupsEndpoint(GROUPS);
  setupTokenStatusEndpoint({ valid: true });

  renderWithProviders(
    <Route
      path="/admin/permissions/tenant-collections/:collectionId"
      element={<TenantCollectionPermissionsPage />}
    />,
    {
      withRouter: true,
      initialRoute: "/admin/permissions/tenant-collections/root",
      storeInitialState: createMockState({ settings: SETTINGS_STATE }),
    },
  );
};

const revokeAccess = async (groupName: string) => {
  const row = await screen.findByRole("row", {
    name: `${groupName} permissions`,
  });
  await userEvent.click(within(row).getByText("View"));
  await userEvent.click(await screen.findByText("No access"));

  return screen.findByRole("dialog");
};

describe("TenantCollectionPermissionsPage", () => {
  it("shows every group's access to the shared tenant collection root", async () => {
    setup();

    for (const group of GROUPS) {
      const row = await screen.findByRole("row", {
        name: `${group.name} permissions`,
      });
      expect(within(row).getByTestId("permissions-select")).toHaveTextContent(
        "View",
      );
    }
  });

  it("warns about the internal default group when revoking an internal group's access (EMB-1143)", async () => {
    setup();

    const modal = await revokeAccess(INTERNAL_GROUP.name);

    expect(modal).toHaveTextContent(
      'Revoke access even though "All internal users" has greater access?',
    );
    expect(modal).toHaveTextContent(
      'The "All internal users" group has a higher level of access',
    );
    expect(modal).not.toHaveTextContent("tenant users");
  });

  it("warns about the tenant default group when revoking a tenant group's access", async () => {
    setup();

    const modal = await revokeAccess(TENANT_GROUP.name);

    expect(modal).toHaveTextContent(
      'Revoke access even though "All tenant users" has greater access?',
    );
    expect(modal).toHaveTextContent(
      'The "All tenant users" group has a higher level of access',
    );
    expect(modal).not.toHaveTextContent("internal users");
  });
});
