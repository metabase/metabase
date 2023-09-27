import { Route } from "react-router";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";

import { createMockCollection } from "metabase-types/api/mocks";

import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";

import type { CollectionPermissionsGraph } from "metabase-types/api";
import { CollectionPermissionsPage } from "./CollectionPermissionsPage";

const personalCollection = createMockCollection({
  id: "personal",
  name: "Personal",
  personal_owner_id: 1,
});

const nestedCollectionOne = createMockCollection({
  id: 3,
  name: "Nested One",
  location: "/1/",
});
const nestedCollectionTwo = createMockCollection({
  id: 4,
  name: "Nested Two",
  location: "/2/",
});

const collectionOne = createMockCollection({
  id: 1,
  name: "Collection One",
  children: [nestedCollectionOne],
});
const collectionTwo = createMockCollection({
  id: 2,
  name: "Collection Two",
  children: [nestedCollectionTwo],
});

const rootCollection = createMockCollection({
  id: "root",
  name: "Our analytics",
  children: [collectionOne, collectionTwo],
});

const permissionsGraph: CollectionPermissionsGraph = {
  revision: 23,
  groups: {
    1: {
      1: "write",
      2: "write",
      3: "read",
      4: "none",
      root: "read",
    },
    2: {
      1: "write",
      2: "write",
      3: "write",
      4: "write",
      root: "write",
    },
    3: {
      1: "read",
      2: "read",
      3: "none",
      4: "none",
      root: "read",
    },
  },
};

function setup() {
  setupCollectionsEndpoints({
    collections: [collectionOne, collectionTwo, personalCollection],
    rootCollection: rootCollection,
  });

  setupCollectionPermissionsGraphEndpoint(permissionsGraph);

  setupGroupsEndpoint([
    { id: 1, name: "All Users", member_count: 40 },
    { id: 2, name: "Administrators", member_count: 2 },
    { id: 3, name: "Other Users", member_count: 33 },
  ]);

  const initialState = createMockState();

  renderWithProviders(
    <>
      <Route
        path="/admin/permissions/collections/root"
        component={CollectionPermissionsPage}
      />
      <Route
        path="/admin/permissions/collections/:collectionId"
        component={CollectionPermissionsPage}
      />
    </>,
    {
      storeInitialState: initialState,
      withRouter: true,
      initialRoute: "/admin/permissions/collections/root",
    },
  );
}

describe("Admin > CollectionPermissionsPage", () => {
  describe("CollectionPermissionsPage", () => {
    it("should show a collections tree in the sidebar", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();
      expect(await screen.findByText("Our analytics")).toBeVisible();
      expect(await screen.findByText("Collection One")).toBeVisible();
      expect(await screen.findByText("Collection Two")).toBeVisible();
    });

    it("should allow expansion of nested collections", async () => {
      await setup();

      const collection1 = await screen.findByText("Collection One");
      expect(screen.queryByText("Nested One")).not.toBeInTheDocument();
      userEvent.click(collection1);
      expect(await screen.findByText("Nested One")).toBeInTheDocument();
    });

    it("should not show personal collection", async () => {
      await setup();

      expect(await screen.findByText("Collection One")).toBeInTheDocument();
      expect(screen.queryByText("Personal")).not.toBeInTheDocument();
    });

    it("should show a permissions table for the selected collection", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();

      userEvent.click(await screen.findByText("Collection One"));
      userEvent.click(await screen.findByText("Nested One"));

      expect(
        await screen.findByText("Permissions for Nested One"),
      ).toBeVisible();
      expect(await screen.findByText("Administrators")).toBeVisible();
      expect(await screen.findByText("All Users")).toBeVisible();
      expect(await screen.findByText("Other Users")).toBeVisible();

      // 1 groups has write, 1 has read, 1 has none
      expect(await screen.findByText("Curate")).toBeInTheDocument();
      expect(await screen.findByText("View")).toBeInTheDocument();
      expect(await screen.findByText("No access")).toBeInTheDocument();
    });

    it("can change group permissions", async () => {
      await setup();

      expect(
        await screen.findByText("Select a collection to see its permissions"),
      ).toBeVisible();

      userEvent.click(await screen.findByText("Collection One"));
      userEvent.click(await screen.findByText("Nested One"));

      // change no access to view
      userEvent.click(await screen.findByText("No access"));
      const listbox = await screen.findByRole("listbox");
      userEvent.click(within(listbox).getByText("View"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).toBeInTheDocument();

      userEvent.click(await screen.findByText("Save changes"));

      // are you sure you want to save?
      userEvent.click(await screen.findByText("Yes"));

      expect(
        await screen.findByText("You've made changes to permissions."),
      ).not.toBeInTheDocument();

      expect(await screen.findByText("Curate")).toBeInTheDocument();
      expect(await screen.findAllByText("View")).toHaveLength(2);
      expect(screen.queryByText("No access")).not.toBeInTheDocument();

      const lastRequest = await fetchMock
        .lastCall("path:/api/collection/graph", {
          method: "PUT",
        })
        ?.request?.json();

      expect(lastRequest).toEqual({
        ...permissionsGraph,
        groups: {
          ...permissionsGraph.groups,
          3: {
            ...permissionsGraph.groups[3],
            3: "read",
          },
        },
      });
    });
  });
});
