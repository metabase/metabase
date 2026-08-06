import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import { screen, waitFor, within } from "__support__/ui";
import * as Urls from "metabase/urls";
import { createMockCollection } from "metabase-types/api/mocks";

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

  describe("paged levels", () => {
    const { setIntersecting } = setupMockIntersectionObserver();

    const MANY_COLLECTIONS = Array.from({ length: 5 }, (_, index) =>
      createMockCollection({
        id: 100 + index,
        name: `Wide collection ${index + 1}`,
      }),
    );

    it("should show only the first page until the end of the list is reached", async () => {
      await setup({
        simulateLargeInstance: true,
        collections: MANY_COLLECTIONS,
        lazyPageSize: 2,
      });

      expect(
        await screen.findByRole("treeitem", { name: /Wide collection 1/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("treeitem", { name: /Wide collection 3/ }),
      ).not.toBeInTheDocument();

      setIntersecting(true);

      expect(
        await screen.findByRole("treeitem", { name: /Wide collection 3/ }),
      ).toBeInTheDocument();
      // The first page is kept rather than replaced.
      expect(
        screen.getByRole("treeitem", { name: /Wide collection 1/ }),
      ).toBeInTheDocument();
    });

    it("should page a nested level too, not just the root", async () => {
      const parent = createMockCollection({
        id: 300,
        name: "Parent collection",
        children: Array.from({ length: 5 }, (_, index) =>
          createMockCollection({
            id: 310 + index,
            name: `Nested child ${index + 1}`,
            location: "/300/",
          }),
        ),
      });

      await setup({
        simulateLargeInstance: true,
        collections: [parent],
        lazyPageSize: 2,
      });

      const node = await screen.findByRole("treeitem", {
        name: /Parent collection/,
      });
      await userEvent.click(within(node).getByRole("button"));

      expect(
        await screen.findByRole("treeitem", { name: /Nested child 1/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("treeitem", { name: /Nested child 3/ }),
      ).not.toBeInTheDocument();

      setIntersecting(true);

      expect(
        await screen.findByRole("treeitem", { name: /Nested child 3/ }),
      ).toBeInTheDocument();
    });

    it("should stop watching once the level is exhausted", async () => {
      await setup({
        simulateLargeInstance: true,
        collections: MANY_COLLECTIONS,
        lazyPageSize: 4,
      });

      expect(
        await screen.findByRole("treeitem", { name: /Wide collection 1/ }),
      ).toBeInTheDocument();

      setIntersecting(true);

      expect(
        await screen.findByRole("treeitem", { name: /Wide collection 5/ }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByTestId("tree-load-more")).not.toBeInTheDocument(),
      );
    });
  });

  it("should keep the list on screen while opening a collection refetches it", async () => {
    await setup({
      simulateLargeInstance: true,
      collections: [
        createMockCollection({ id: 200, name: "Sibling collection" }),
      ],
      delayExpandTo: true,
    });

    const target = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    expect(
      screen.getByRole("treeitem", { name: /Sibling collection/ }),
    ).toBeInTheDocument();

    // Opening a collection changes `expand-to`, which re-keys the root request. The list must not blink out while
    // the replacement is in flight.
    await userEvent.click(within(target).getByRole("link"));

    expect(
      screen.getByRole("treeitem", { name: /Sibling collection/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: /Test collection/i }),
    ).toBeInTheDocument();
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

  it("should prefetch a collection's children when the pointer settles on it", async () => {
    await setup({ simulateLargeInstance: true });

    const collection = await screen.findByRole("treeitem", {
      name: /Test collection/i,
    });
    expect(levelFetches()).toEqual([]);

    await userEvent.hover(collection);

    // The children are in the cache before any click, so expanding is instant.
    await waitFor(() => expect(levelFetches()).toHaveLength(1));
    expect(levelFetches()[0]).toContain(`collection-id=${TEST_COLLECTION.id}`);
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
