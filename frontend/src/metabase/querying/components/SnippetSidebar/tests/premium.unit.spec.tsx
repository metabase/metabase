import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import {
  setup as baseSetup,
  createFolderCollectionItem,
  createSnippetCollectionItem,
} from "./setup";

const FOLDER_A = createMockCollection({
  id: 1,
  name: "Folder A",
  namespace: "snippets",
  location: "/",
  parent_id: null,
});
const FOLDER_B = createMockCollection({
  id: 2,
  name: "Folder B",
  namespace: "snippets",
  location: `/${FOLDER_A.id}/`,
  parent_id: FOLDER_A.id,
});
const SNIPPET_IN_FOLDER_B = createMockNativeQuerySnippet({
  name: "snippet 1",
  collection_id: FOLDER_B.id,
});

async function setup(options: SetupOpts = {}) {
  return await baseSetup({
    enterprisePlugins: ["snippets"],
    tokenFeatures: { snippet_collections: true },
    ...options,
  });
}

describe("SnippetSidebar (EE with token feature)", () => {
  beforeEach(() => {
    reinitialize();
  });

  it("should display the `Change permissions` menu for admin users", async () => {
    await setup();
    await userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Change permissions")).toBeInTheDocument();
  });

  it("should not display the `Change permissions` menu for non-admin users", async () => {
    await setup({ user: { is_superuser: false } });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` and the `New folder` option", async () => {
    await setup();
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
  });

  it("should display snippet folders and open one when it is clicked", async () => {
    const { setSnippetCollectionId } = await setup({
      snippets: [SNIPPET_IN_FOLDER_B],
      collections: [FOLDER_A, FOLDER_B],
      collectionItems: { root: [createFolderCollectionItem(FOLDER_A)] },
    });

    expect(screen.queryByText("snippet 1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Folder A"));

    expect(setSnippetCollectionId).toHaveBeenCalledWith(FOLDER_A.id);
  });

  it("should display the content of a nested folder", async () => {
    await setup({
      snippets: [SNIPPET_IN_FOLDER_B],
      collections: [FOLDER_A, FOLDER_B],
      collectionItems: {
        [FOLDER_B.id]: [createSnippetCollectionItem(SNIPPET_IN_FOLDER_B)],
      },
      snippetCollectionId: FOLDER_B.id,
    });

    expect(screen.getByText("Folder B")).toBeInTheDocument();
    expect(screen.getByText("snippet 1")).toBeInTheDocument();
  });

  it.each([
    { from: FOLDER_B, to: FOLDER_A.id },
    { from: FOLDER_A, to: null },
  ])(
    "should go back from $from.name to its parent folder (metabase#63405)",
    async ({ from, to }) => {
      const { setSnippetCollectionId } = await setup({
        snippets: [SNIPPET_IN_FOLDER_B],
        collections: [FOLDER_A, FOLDER_B],
        snippetCollectionId: from.id,
      });

      await userEvent.click(screen.getByText(from.name));

      expect(setSnippetCollectionId).toHaveBeenCalledTimes(1);
      expect(setSnippetCollectionId).toHaveBeenCalledWith(to);
    },
  );

  it("should go back to the root folder when the user cannot see the parent folder", async () => {
    const { setSnippetCollectionId } = await setup({
      user: { is_superuser: false },
      snippets: [SNIPPET_IN_FOLDER_B],
      collections: [FOLDER_B],
      snippetCollectionId: FOLDER_B.id,
    });

    await userEvent.click(screen.getByText("Folder B"));

    expect(setSnippetCollectionId).toHaveBeenCalledWith(null);
  });

  describe("read-only remote sync", () => {
    const snippet = createMockNativeQuerySnippet({
      name: "stuff-snippet",
      content: "select 'snippet 1'",
    });
    const folder = createMockCollection({
      id: 1,
      name: "My favorite snippets",
      namespace: "snippets",
      can_write: true,
    });

    async function setupReadOnly({
      remoteSyncType,
    }: Pick<SetupOpts, "remoteSyncType">) {
      return setup({
        enterprisePlugins: ["snippets", "remote_sync"],
        tokenFeatures: { snippet_collections: true, remote_sync: true },
        user: { is_superuser: false },
        snippets: [snippet],
        collections: [folder],
        collectionItems: {
          root: [
            createFolderCollectionItem(folder),
            createSnippetCollectionItem(snippet),
          ],
        },
        remoteSyncType,
      });
    }

    it("should not let you create or edit a snippet or a snippet folder", async () => {
      await setupReadOnly({ remoteSyncType: "read-only" });

      expect(screen.getByText("My favorite snippets")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Search snippets" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Add" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Snippet folder options" }),
      ).not.toBeInTheDocument();

      await userEvent.click(getIcon("chevrondown"));

      expect(screen.getByText("select 'snippet 1'")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Edit/ }),
      ).not.toBeInTheDocument();
    });

    it("should let you create and edit snippets and snippet folders in read-write mode", async () => {
      await setupReadOnly({ remoteSyncType: "read-write" });

      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Snippet folder options" }),
      ).toBeInTheDocument();

      await userEvent.click(getIcon("chevrondown"));

      expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
    });
  });

  it("should open the collection modal when creating a new folder", async () => {
    const { store } = await setup();

    await userEvent.click(getIcon("add"));
    await userEvent.click(await screen.findByText("New folder"));

    expect(store.getState().modal).toMatchObject({
      id: "collection",
      props: {
        initialCollectionId: null,
        namespaces: ["snippets"],
        showAuthorityLevelPicker: false,
        shouldNavigateOnCreate: false,
      },
    });
  });
});
