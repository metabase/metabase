import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";

import {
  createFolderCollectionItem,
  createSnippetCollectionItem,
  setup,
} from "./setup";

describe("SnippetSidebar (OSS)", () => {
  it("should not display the `Change permissions` menu", async () => {
    await setup();
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` but not the `New folder` option", async () => {
    await setup();
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.queryByText("New folder")).not.toBeInTheDocument();
  });

  it("should open the snippet modal from the `New snippet` option when snippets exist (metabase#57441)", async () => {
    const { openSnippetModalWithSelectedText } = await setup();

    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(await screen.findByText("New snippet"));

    expect(openSnippetModalWithSelectedText).toHaveBeenCalledTimes(1);
  });

  it("should filter snippets by name and show all of them again when the search is closed", async () => {
    const snippets = [
      createMockNativeQuerySnippet({ id: 1, name: "snippet 2" }),
      createMockNativeQuerySnippet({ id: 2, name: "snippet 14" }),
      createMockNativeQuerySnippet({ id: 3, name: "Foo" }),
    ];
    await setup({ snippets });

    await userEvent.click(
      screen.getByRole("button", { name: "Search snippets" }),
    );
    await userEvent.type(screen.getByRole("textbox"), "SNIPPET 1");

    expect(screen.getByText("snippet 14")).toBeInTheDocument();
    expect(screen.queryByText("snippet 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Foo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close search" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("snippet 2")).toBeInTheDocument();
    expect(screen.getByText("snippet 14")).toBeInTheDocument();
    expect(screen.getByText("Foo")).toBeInTheDocument();
  });

  it("should insert a snippet when its name is clicked", async () => {
    const snippet = createMockNativeQuerySnippet({ name: "stuff-snippet" });
    const { insertSnippet } = await setup({ snippets: [snippet] });

    await userEvent.click(screen.getByText("stuff-snippet"));

    expect(insertSnippet).toHaveBeenCalledTimes(1);
    expect(insertSnippet).toHaveBeenCalledWith(
      expect.objectContaining(snippet),
    );
  });

  it("should show the snippet content and open the edit modal from an expanded snippet", async () => {
    const snippet = createMockNativeQuerySnippet({
      name: "stuff-snippet",
      content: "select 'stuff'",
    });
    const { insertSnippet, setModalSnippet } = await setup({
      snippets: [snippet],
    });

    await userEvent.click(getIcon("chevrondown"));

    expect(screen.getByText("select 'stuff'")).toBeInTheDocument();
    expect(insertSnippet).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));

    expect(setModalSnippet).toHaveBeenCalledTimes(1);
    expect(setModalSnippet).toHaveBeenCalledWith(
      expect.objectContaining(snippet),
    );
  });

  it("should not render snippet folders without the snippet collections feature", async () => {
    const folder = createMockCollection({
      id: 1,
      name: "Snippet Folder",
      namespace: "snippets",
    });
    const snippet = createMockNativeQuerySnippet({
      name: "snippet 1",
      collection_id: folder.id,
    });
    await setup({
      snippets: [snippet],
      collections: [folder],
      collectionItems: {
        root: [
          createFolderCollectionItem(folder),
          createSnippetCollectionItem(snippet),
        ],
      },
    });

    expect(screen.getByText("snippet 1")).toBeInTheDocument();
    expect(screen.queryByText("Snippet Folder")).not.toBeInTheDocument();
  });
});
