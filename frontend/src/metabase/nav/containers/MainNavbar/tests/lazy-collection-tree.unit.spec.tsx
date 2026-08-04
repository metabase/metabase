import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import * as Urls from "metabase/urls";

import { NESTED_COLLECTION, TEST_COLLECTION, setup } from "./setup";

const levelFetches = () =>
  fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter(
      (url) =>
        url.includes("/api/collection/tree") && url.includes("collection-id="),
    );

/**
 * Covers the branch the adaptive tree takes on an instance too large to return in one response. The default setup
 * covers the other branch, where the whole tree arrives at once and nothing is ever fetched again.
 */
describe("nav > containers > MainNavbar > lazy collection tree", () => {
  it("should not fetch children that the first response already delivered", async () => {
    await setup();

    const collection = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    await userEvent.click(within(collection).getByRole("button"));

    expect(
      await screen.findByRole("treeitem", { name: /Nested collection/i }),
    ).toBeInTheDocument();
    expect(levelFetches()).toEqual([]);
  });

  it("should not render children until their parent is expanded", async () => {
    await setup({ simulateLargeInstance: true });

    expect(
      await screen.findByRole("treeitem", { name: /Test collection/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("treeitem", { name: /Nested collection/i }),
    ).not.toBeInTheDocument();
  });

  it("should still offer an expand toggle for a collection whose children are unfetched", async () => {
    await setup({ simulateLargeInstance: true });

    const collection = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    expect(within(collection).getByRole("button")).toBeInTheDocument();
  });

  it("should fetch and render children when a collection is expanded", async () => {
    await setup({ simulateLargeInstance: true });

    const collection = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    await userEvent.click(within(collection).getByRole("button"));

    expect(
      await screen.findByRole("treeitem", { name: /Nested collection/i }),
    ).toBeInTheDocument();
  });

  it("should reveal the ancestor path when landing directly on a nested collection", async () => {
    await setup({
      pathname: Urls.collection(NESTED_COLLECTION),
      route: "/collection/:slug",
      simulateLargeInstance: true,
    });

    // The parent was never clicked, so this only appears if the deep link expanded the path for us.
    expect(
      await screen.findByRole("treeitem", { name: /Nested collection/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: /Test collection/i }),
    ).toBeInTheDocument();
  });

  it("should stay collapsed after the revealed collection is toggled shut", async () => {
    await setup({
      pathname: Urls.collection(TEST_COLLECTION),
      route: "/collection/:slug",
      simulateLargeInstance: true,
    });

    const collection = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    expect(
      await screen.findByRole("treeitem", { name: /Nested collection/i }),
    ).toBeInTheDocument();

    // Clicking the selected row toggles it. The chevron is not used here: on a selected row its click also bubbles
    // to the row handler, so the node toggles twice and nothing changes.
    await userEvent.click(collection);

    await waitFor(() => {
      expect(
        screen.queryByRole("treeitem", { name: /Nested collection/i }),
      ).not.toBeInTheDocument();
    });
  });
});
