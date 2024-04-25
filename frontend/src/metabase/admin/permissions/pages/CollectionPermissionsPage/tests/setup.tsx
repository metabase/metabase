import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  CollectionPermissionsGraph,
  Collection,
  Group,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CollectionPermissionsPage } from "../CollectionPermissionsPage";

const personalCollection = createMockCollection({
  id: "personal",
  name: "Personal",
  personal_owner_id: 1,
});

const nestedCollectionOne = createMockCollection({
  id: 3,
  name: "Nested One",
  location: "/1/",
  children: [],
});

const nestedCollectionTwo = createMockCollection({
  id: 4,
  name: "Nested Two",
  location: "/2/",
  children: [],
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

export const defaultCollections = [
  collectionOne,
  collectionTwo,
  personalCollection,
];

export const defaultRootCollection = createMockCollection({
  id: "root",
  name: "Our analytics",
  children: [collectionOne, collectionTwo],
});

const defaultPermissionGroups: Omit<Group, "members">[] = [
  { id: 1, name: "All Users", member_count: 40 },
  { id: 2, name: "Administrators", member_count: 2 },
  { id: 3, name: "Other Users", member_count: 33 },
];

export const defaultPermissionsGraph: CollectionPermissionsGraph = {
  revision: 23,
  groups: {
    1: {
      // all users
      1: "write", // one
      2: "write", // two
      3: "read", // nested one
      4: "none", // nested two
      root: "read",
    },
    2: {
      // Administrators
      1: "write", // one
      2: "write", // two
      3: "write", // nested one
      4: "write", // nested two
      root: "write",
    },
    3: {
      // Other users
      1: "read", // one
      2: "read", // two
      3: "none", // nested one
      4: "none", // nested two
      root: "read",
    },
  },
};

interface SetupOptions {
  initialRoute?: string;
  collections?: Collection[];
  rootCollection?: Collection;
  permissionsGraph?: CollectionPermissionsGraph;
  permissionGroups?: Omit<Group, "members">[];
  tokenFeatures?: Partial<TokenFeatures>;
}

export function setup({
  initialRoute = "/admin/permissions/collections/root",
  collections = defaultCollections,
  rootCollection = defaultRootCollection,
  permissionsGraph = defaultPermissionsGraph,
  permissionGroups = defaultPermissionGroups,
  tokenFeatures,
}: Partial<SetupOptions> = {}) {
  const initialState = createMockState({
    settings: mockSettings({
      "application-colors": {},
      "token-features": createMockTokenFeatures(tokenFeatures ?? {}),
    }),
  });

  if (tokenFeatures) {
    setupEnterprisePlugins();
  }

  setupCollectionsEndpoints({
    collections,
    rootCollection,
  });

  setupCollectionPermissionsGraphEndpoint(permissionsGraph);
  setupGroupsEndpoint(permissionGroups);

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
      initialRoute,
    },
  );
}
