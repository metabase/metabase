import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import type { CollectionPermissionsGraph } from "metabase-types/api";
import { setup, defaultPermissionsGraph, defaultCollections } from "./setup";

describe("Admin > CollectionPermissionsPage (enterprise)", () => {
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
      });

      expect(await screen.findByText("Instance Analytics")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(3);

      userEvent.click(
        await screen.findAllByText("View").then(dropdowns => dropdowns[2]),
      );

      expect(await screen.findByText("No access")).toBeInTheDocument();
      expect(screen.queryByText("Curate")).not.toBeInTheDocument();
    });

    it("should display tooltip explaining why instance analytics collection cannot be curated by admins", async () => {
      await setup({
        collections: [...defaultCollections, iaCollection],
        permissionsGraph: iaPermissionsGraph,
        initialRoute: `/admin/permissions/collections/${iaCollection.id}`,
        tokenFeatures: { audit_app: true },
      });

      expect(await screen.findByText("Instance Analytics")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(3);

      userEvent.hover(
        await screen.findAllByText("View").then(dropdowns => dropdowns[1]),
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
      });

      // change all users users view to no access
      userEvent.click(
        await screen.findAllByText("View").then(dropdowns => dropdowns[0]),
      );
      userEvent.click(await screen.findByText("No access"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).toBeInTheDocument();

      userEvent.click(await screen.findByText("Save changes"));

      // are you sure you want to save?
      userEvent.click(await screen.findByText("Yes"));

      expect(
        await screen.findByText("You've made changes to permissions."),
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
          ...iaPermissionsGraph.groups,
          1: {
            ...iaPermissionsGraph.groups[1],
            13371337: "none",
          },
        },
      });
    });
  });
});
