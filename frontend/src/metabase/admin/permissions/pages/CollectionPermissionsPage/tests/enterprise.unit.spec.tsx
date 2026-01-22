import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import type { CollectionPermissionsGraph } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  defaultCollections,
  defaultPermissionGroupsWithTenants,
  defaultPermissionsGraph,
  defaultPermissionsGraphWithTenants,
  setup,
} from "./setup";

const tokenFeatures = { tenants: true, audit_app: true };

describe("Admin > CollectionPermissionsPage (enterprise)", () => {
  describe("Shared collections Tab", () => {
    it("shows the tab when tenants are enabled", async () => {
      setup({
        tokenFeatures,
        enterprisePlugins: ["tenants", "audit_app"],
        settings: { "use-tenants": true },
      });

      expect(
        await screen.findByRole("radio", { name: "Shared collections" }),
      ).toBeInTheDocument();
    });

    it("hides the tab when tenants are disabled", async () => {
      setup({
        tokenFeatures,
        enterprisePlugins: ["tenants", "audit_app"],
        settings: { "use-tenants": false },
      });

      expect(
        screen.queryByRole("radio", { name: "Shared collections" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Tenant users Group", () => {
    it("should not be able get access to Our Analytics", async () => {
      await setup({
        tokenFeatures,
        enterprisePlugins: ["tenants", "audit_app"],
        initialRoute: "/admin/permissions/collections/root",
        permissionGroups: defaultPermissionGroupsWithTenants,
        permissionsGraph: defaultPermissionsGraphWithTenants,
      });

      await assertCollectionAccessForGroup("Administrators", "Curate");
      await assertCollectionAccessForGroup("All internal users", "View");
      await assertCollectionAccessForGroup("Other Users", "View");
      await assertCollectionAccessForGroup("All tenant users", "No access");
      await assertCollectionAccessIsDisabled("All tenant users");
    });

    it("should not be able get access to normal collections", async () => {
      await setup({
        tokenFeatures,
        enterprisePlugins: ["tenants", "audit_app"],
        initialRoute: "/admin/permissions/collections/2",
        permissionGroups: defaultPermissionGroupsWithTenants,
        permissionsGraph: defaultPermissionsGraphWithTenants,
      });

      await assertCollectionAccessForGroup("Administrators", "Curate");
      await assertCollectionAccessForGroup("All internal users", "Curate");
      await assertCollectionAccessForGroup("Other Users", "View");
      await assertCollectionAccessForGroup("All Tenant users", "No access");
      await assertCollectionAccessIsDisabled("All Tenant users");
    });
  });

  describe("Instance Analytics", () => {
    const iaCollection = createMockCollection({
      id: 13371337,
      name: "Instance Analytics",
      type: "instance-analytics",
      children: [],
    });

    const iaPermissionsGraph: CollectionPermissionsGraph = {
      ...defaultPermissionsGraph,
      groups: Object.entries(defaultPermissionsGraph.groups).reduce(
        (graph, [groupId, groupPermissions]) => {
          return {
            ...graph,
            [groupId]: {
              ...groupPermissions,
              [iaCollection.id]: "read",
            },
          };
        },
        {},
      ),
    };

    it("should not allow curate permissions for instance analytics collection", async () => {
      await setup({
        collections: [...defaultCollections, iaCollection],
        permissionsGraph: iaPermissionsGraph,
        initialRoute: `/admin/permissions/collections/${iaCollection.id}`,
        tokenFeatures: { audit_app: true },
        enterprisePlugins: ["audit_app", "collections"],
      });

      await assertCollectionAccessForGroup("Administrators", "View");
      await assertCollectionAccessForGroup("All internal users", "View");
      await assertCollectionAccessForGroup("Other Users", "View");

      await userEvent.click(await getCollectionPermissionCell("Other Users"));

      expect(await screen.findByRole("dialog")).toHaveTextContent("No access");
      expect(await screen.findByRole("dialog")).not.toHaveTextContent("Curate");
    });

    it("should display tooltip explaining why instance analytics collection cannot be curated by admins", async () => {
      await setup({
        collections: [...defaultCollections, iaCollection],
        permissionsGraph: iaPermissionsGraph,
        initialRoute: `/admin/permissions/collections/${iaCollection.id}`,
        tokenFeatures: { audit_app: true },
        enterprisePlugins: ["audit_app", "collections"],
      });

      await assertCollectionAccessForGroup("Administrators", "View");
      await assertCollectionAccessForGroup("All internal users", "View");
      await assertCollectionAccessForGroup("Other Users", "View");
      await assertCollectionAccessIsDisabled("Administrators");

      await userEvent.hover(
        within(await getCollectionPermissionCell("Administrators")).getByText(
          "View",
        ),
      );

      expect(
        await screen.findByText(/read-only for admin users/i),
      ).toBeInTheDocument();
    });

    it("should be able to change instance analytics collection permissions", async () => {
      await setup({
        collections: [...defaultCollections, iaCollection],
        permissionsGraph: iaPermissionsGraph,
        initialRoute: `/admin/permissions/collections/${iaCollection.id}`,
        tokenFeatures: { audit_app: true },
        enterprisePlugins: ["audit_app", "collections"],
      });

      // change all internal users view to no access
      const allUsersRow = await screen.findByRole("row", {
        name: /All internal users/i,
      });
      await userEvent.click(within(allUsersRow).getByText("View"));
      await userEvent.click(await screen.findByText("No access"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Save changes"));

      // are you sure you want to save?
      await userEvent.click(await screen.findByText("Yes"));

      expect(
        screen.queryByText("You've made changes to permissions."),
      ).not.toBeInTheDocument();

      expect(await screen.findAllByText("View")).toHaveLength(2);
      expect(await screen.findByText("No access")).toBeInTheDocument();

      const calls = fetchMock.callHistory.calls("path:/api/collection/graph", {
        method: "PUT",
      });
      const lastCall = calls[calls.length - 1];
      const lastRequest = await lastCall?.request?.json();

      expect(lastRequest).toEqual({
        ...iaPermissionsGraph,
        groups: {
          1: {
            ...iaPermissionsGraph.groups[1],
            13371337: "none",
          },
        },
      });
    });
  });
});

const assertCollectionAccessForGroup = async (
  group: string,
  access: string,
) => {
  expect(await getCollectionPermissionCell(group)).toHaveTextContent(access);
};

const assertCollectionAccessIsDisabled = async (
  group: string,
  disabled: boolean = true,
) => {
  expect(await getCollectionPermissionCell(group)).toHaveAttribute(
    "aria-disabled",
    disabled.toString(),
  );
};

const getCollectionPermissionCell = async (group: string) =>
  within(
    await screen.findByRole("row", { name: new RegExp(group, "i") }),
  ).getByTestId("permissions-select");
