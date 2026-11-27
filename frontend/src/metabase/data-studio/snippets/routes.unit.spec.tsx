import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { lazyLoaders } from "__support__/lazy-routes";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
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
import * as Urls from "metabase/urls";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { getDataStudioSnippetRoutes } from "./routes";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Root",
  namespace: "snippets",
});

type SnippetFolderOpts = {
  id: number;
  name: string;
  ancestors?: Collection[];
};

function createSnippetFolder({
  id,
  name,
  ancestors = [],
}: SnippetFolderOpts): Collection {
  const parent = ancestors.at(-1);
  return createMockCollection({
    id,
    name,
    namespace: "snippets",
    parent_id: parent ? Number(parent.id) : null,
    location: `/${ancestors.map((ancestor) => `${ancestor.id}/`).join("")}`,
    effective_ancestors: [ROOT_COLLECTION, ...ancestors],
  });
}

type SetupOpts = {
  folders: Collection[];
  snippets: NativeQuerySnippet[];
  initialSnippet: NativeQuerySnippet;
};

function setup({ folders, snippets, initialSnippet }: SetupOpts) {
  setupCollectionByIdEndpoint({ collections: [ROOT_COLLECTION, ...folders] });
  setupCollectionsEndpoints({
    collections: [ROOT_COLLECTION, ...folders],
    rootCollection: ROOT_COLLECTION,
  });
  setupNativeQuerySnippetEndpoints({ snippets });
  setupEnterpriseOnlyPlugin("snippets");

  renderWithProviders(
    <Route path="data-studio">{getDataStudioSnippetRoutes()}</Route>,
    {
      withRouter: true,
      initialRoute: Urls.dataStudioSnippet(initialSnippet.id),
      storeInitialState: createMockState({
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            snippet_collections: true,
          }),
        }),
        currentUser: createMockUser({
          is_superuser: true,
          permissions: { can_create_native_queries: true },
        }),
      }),
    },
  );
}

describe("data studio snippet routes", () => {
  beforeEach(() => {
    reinitialize();
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioSnippetRoutes());

    expect(loaders).toHaveLength(5);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  describe("breadcrumb folder expansion", () => {
    it("expands only the path to the folder clicked in the breadcrumbs", async () => {
      const parentFolder = createSnippetFolder({
        id: 1,
        name: "Parent Folder",
      });
      const childFolder = createSnippetFolder({
        id: 2,
        name: "Child Folder",
        ancestors: [parentFolder],
      });
      const siblingFolder = createSnippetFolder({
        id: 3,
        name: "Sibling Folder",
      });
      const nestedSnippet = createMockNativeQuerySnippet({
        id: 10,
        name: "Nested Snippet",
        collection_id: childFolder.id,
      });
      const siblingSnippet = createMockNativeQuerySnippet({
        id: 11,
        name: "Sibling Snippet",
        collection_id: siblingFolder.id,
      });
      setup({
        folders: [parentFolder, childFolder, siblingFolder],
        snippets: [nestedSnippet, siblingSnippet],
        initialSnippet: siblingSnippet,
      });

      await clickBreadcrumb("Sibling Folder");

      let page = await screen.findByTestId("library-page");
      expect(
        await within(page).findByText("Sibling Snippet"),
      ).toBeInTheDocument();
      expect(within(page).getByText("Sibling Folder")).toBeInTheDocument();
      expect(within(page).getByText("Parent Folder")).toBeInTheDocument();
      expect(within(page).queryByText("Child Folder")).not.toBeInTheDocument();
      expect(
        within(page).queryByText("Nested Snippet"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(page).getByText("Parent Folder"));
      await userEvent.click(await within(page).findByText("Child Folder"));
      await userEvent.click(await within(page).findByText("Nested Snippet"));
      expect(
        await screen.findByTestId("edit-snippet-page"),
      ).toBeInTheDocument();

      await clickBreadcrumb("Child Folder");

      page = await screen.findByTestId("library-page");
      expect(
        await within(page).findByText("Nested Snippet"),
      ).toBeInTheDocument();
      expect(within(page).getByText("Child Folder")).toBeInTheDocument();
      expect(within(page).getByText("Parent Folder")).toBeInTheDocument();
      expect(within(page).getByText("Sibling Folder")).toBeInTheDocument();
      expect(
        within(page).queryByText("Sibling Snippet"),
      ).not.toBeInTheDocument();
    });

    it("expands the parent folders of a folder in the middle of the breadcrumbs", async () => {
      const grandParentFolder = createSnippetFolder({
        id: 1,
        name: "GrandParent Folder",
      });
      const parentFolder = createSnippetFolder({
        id: 2,
        name: "Parent Folder",
        ancestors: [grandParentFolder],
      });
      const childFolder = createSnippetFolder({
        id: 3,
        name: "Child Folder",
        ancestors: [grandParentFolder, parentFolder],
      });
      const deepSnippet = createMockNativeQuerySnippet({
        id: 10,
        name: "Deep Snippet",
        collection_id: childFolder.id,
      });
      setup({
        folders: [grandParentFolder, parentFolder, childFolder],
        snippets: [deepSnippet],
        initialSnippet: deepSnippet,
      });

      await clickBreadcrumb("Parent Folder");

      const page = await screen.findByTestId("library-page");
      expect(await within(page).findByText("Child Folder")).toBeInTheDocument();
      expect(within(page).getByText("Parent Folder")).toBeInTheDocument();
      expect(within(page).getByText("GrandParent Folder")).toBeInTheDocument();
      expect(within(page).queryByText("Deep Snippet")).not.toBeInTheDocument();
    });
  });
});

async function clickBreadcrumb(name: string) {
  const header = await screen.findByTestId("snippet-header");
  await userEvent.click(await within(header).findByRole("link", { name }));
}
