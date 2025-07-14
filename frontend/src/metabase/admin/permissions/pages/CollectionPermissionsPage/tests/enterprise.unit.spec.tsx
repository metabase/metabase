import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import type { CollectionPermissionsGraph } from "metabase-types/api";
import {
  createMockCollection,
  createMockGroup,
} from "metabase-types/api/mocks";

import {
  defaultCollections,
  defaultPermissionGroups,
  defaultPermissionsGraph,
  setup,
} from "./setup";

const tokenFeatures = { tenants: true, audit_app: true };

describe("Admin > CollectionPermissionsPage (enterprise)", () => {
  describe("External Users Group", () => {
    const externalUsersGroup = createMockGroup({
      id: 4,
      name: "External Users",
    });

    it("should not be able give access to Our Analytics", async () => {
      await setup({
        tokenFeatures,
        initialRoute: "/admin/permissions/collections/root",
        permissionGroups: [...defaultPermissionGroups, externalUsersGroup],
        permissionsGraph: {
          ...defaultPermissionsGraph,
          groups: {
            ...defaultPermissionsGraph.groups,
            [externalUsersGroup.id]: Object.entries(defaultCollections).reduce(
              (graph, [collectionId]) => {
                return {
                  ...graph,
                  [collectionId]: "none",
                };
              },
              { root: "none" },
            ),
          },
        },
      });

      expect(await screen.findByText("External Users")).toBeInTheDocument();
      expect(await screen.findByText("No access")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(2);
      expect(await screen.findAllByText("Curate")).toHaveLength(1);
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

      expect(await screen.findByText("Instance Analytics")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(3);

      await userEvent.click(
        await screen.findAllByText("View").then((dropdowns) => dropdowns[2]),
      );

      expect(await screen.findByText("No access")).toBeInTheDocument();
      expect(screen.queryByText("Curate")).not.toBeInTheDocument();
    });

    it("should display tooltip explaining why instance analytics collection cannot be curated by admins", async () => {
      await setup({
        collections: [...defaultCollections, iaCollection],
        permissionsGraph: iaPermissionsGraph,
        initialRoute: `/admin/permissions/collections/${iaCollection.id}`,
        tokenFeatures,
      });

      expect(await screen.findByText("Instance Analytics")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(3);

      await userEvent.hover(
        await screen.findAllByText("View").then((dropdowns) => dropdowns[1]),
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
