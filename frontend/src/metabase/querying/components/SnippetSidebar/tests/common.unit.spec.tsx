import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, queryIcon, screen } from "__support__/ui";

import { setup } from "./setup";

describe("SnippetSidebar (OSS)", () => {
  beforeEach(async () => {
    await setup();
  });

  it("should not display the `Change permissions` menu", () => {
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should display the `New snippet` but not the `New folder` option", async () => {
    await userEvent.click(getIcon("add"));

    expect(await screen.findByText("New snippet")).toBeInTheDocument();
    expect(screen.queryByText("New folder")).not.toBeInTheDocument();
  });
});

describe("SnippetSidebar worktree scoping", () => {
  it("requests snippets and snippet collections scoped to the worktree", async () => {
    await setup({ worktreeId: 7 });

    const snippetsCall = fetchMock.callHistory.lastCall(
      "path:/api/native-query-snippet",
    );
    expect(snippetsCall?.url).toContain("worktree-id=7");

    const collectionsCall = fetchMock.callHistory.lastCall(
      "path:/api/collection",
    );
    expect(collectionsCall?.url).toContain("worktree-id=7");
  });

  it("requests unscoped snippets outside a worktree", async () => {
    await setup();

    const snippetsCall = fetchMock.callHistory.lastCall(
      "path:/api/native-query-snippet",
    );
    expect(snippetsCall?.url).not.toContain("worktree-id");
  });
});
