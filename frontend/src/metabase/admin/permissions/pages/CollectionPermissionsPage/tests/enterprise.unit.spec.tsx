import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import type { CollectionPermissionsGraph } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  defaultCollectionWithTenants,
  defaultCollections,
  defaultPermissionGroupsWithTenants,
  defaultPermissionsGraph,
  defaultPermissionsGraphWithTenants,
  setup,
} from "./setup";

const tokenFeatures = { tenants: true, audit_app: true };

describe("Admin > CollectionPermissionsPage (enterprise)", () => {
  describe("External Users Group", () => {
    it("should not be able get access to Our Analytics", async () => {
      await setup({
        tokenFeatures,
        initialRoute: "/admin/permissions/collections/root",
        permissionGroups: defaultPermissionGroupsWithTenants,
        permissionsGraph: defaultPermissionsGraphWithTenants,
      });

      await assertCollectionAccessForGroup("Administrators", "Curate");
      await assertCollectionAccessForGroup("All Internal Users", "View");
      await assertCollectionAccessForGroup("Other Users", "View");
      await assertCollectionAccessForGroup("All External Users", "No access");
      await assertCollectionAccessIsDisabled("All External Users");
    });

    it("should not be able get access to normal collections", async () => {
      await setup({
        tokenFeatures,
        initialRoute: "/admin/permissions/collections/2",
        permissionGroups: defaultPermissionGroupsWithTenants,
        permissionsGraph: defaultPermissionsGraphWithTenants,
      });

      await assertCollectionAccessForGroup("Administrators", "Curate");
      await assertCollectionAccessForGroup("All Internal Users", "Curate");
      await assertCollectionAccessForGroup("Other Users", "View");
      await assertCollectionAccessForGroup("All External Users", "No access");
      await assertCollectionAccessIsDisabled("All External Users");
    });

    it("should be able to have view access to shared tenant collections", async () => {
      await setup({
        tokenFeatures,
        initialRoute: "/admin/permissions/collections/7",
        permissionGroups: defaultPermissionGroupsWithTenants,
        permissionsGraph: defaultPermissionsGraphWithTenants,
        collections: defaultCollectionWithTenants,
      });

      await assertCollectionAccessForGroup("Administrators", "Curate");
      await assertCollectionAccessForGroup("All Internal Users", "Curate");
      await assertCollectionAccessForGroup("Other Users", "No access");
      await assertCollectionAccessForGroup("All External Users", "View");
      await assertCollectionAccessIsDisabled("All External Users", false);

      await userEvent.click(
        await getCollectionPermissionCell("All External Users"),
      );

      expect(await screen.findByRole("dialog")).toHaveTextContent("View");
      expect(await screen.findByRole("dialog")).toHaveTextContent("No access");
      expect(await screen.findByRole("dialog")).not.toHaveTextContent("Curate");
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
        tokenFeatures,
      });

      await assertCollectionAccessForGroup("Administrators", "View");
      await assertCollectionAccessForGroup("All Internal Users", "View");
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
        tokenFeatures,
      });

      await assertCollectionAccessForGroup("Administrators", "View");
      await assertCollectionAccessForGroup("All Internal Users", "View");
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
        tokenFeatures,
      });

      // change all users users view to no access
      await userEvent.click(
        await screen.findAllByText("View").then((dropdowns) => dropdowns[0]),
      );
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

      const lastRequest = await fetchMock
        .lastCall("path:/api/collection/graph", {
          method: "PUT",
        })
        ?.request?.json();

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
