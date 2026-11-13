import type * as DndKitCore from "@dnd-kit/core";
import type { DragEndEvent, UniqueIdentifier } from "@dnd-kit/core";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupUpdateSettingEndpoint } from "__support__/server-mocks";
import { act, screen, waitFor, within } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import type { Bookmark } from "metabase-types/api";
import { createMockBookmark } from "metabase-types/api/mocks";

import { setup } from "./setup";

const mockDndContext: {
  onDragEnd?: (event: DragEndEvent) => void;
} = {};

// jsdom has no layout, so dnd-kit can't work out where a pointer drag ends.
// Keep the real DndContext, and let the tests drop a bookmark over another one.
jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual<typeof DndKitCore>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      mockDndContext.onDragEnd = props.onDragEnd;
      return <actual.DndContext {...props} />;
    },
  };
});

const EMPTY_RECT = {
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const createDragEndEvent = (
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
): DragEndEvent => ({
  activatorEvent: new Event("pointerdown"),
  active: {
    id: activeId,
    data: { current: undefined },
    rect: { current: { initial: null, translated: null } },
  },
  over: {
    id: overId,
    rect: EMPTY_RECT,
    disabled: false,
    data: { current: undefined },
  },
  collisions: null,
  delta: { x: 0, y: 0 },
});

const dropBookmarkOver = async (active: Bookmark, over: Bookmark) => {
  await act(async () => {
    mockDndContext.onDragEnd?.(createDragEndEvent(active.id, over.id));
  });
};

const createCardBookmark = (id: number, name: string) =>
  createMockBookmark({
    id: `card-${id}`,
    type: "card",
    item_id: id,
    name,
  });

const getBookmarksSection = () =>
  screen.getByRole("section", { name: "Bookmarks" });

const getBookmarkNames = () =>
  within(getBookmarksSection())
    .getAllByRole("listitem")
    .map((item) => item.textContent);

const getReorderRequests = () =>
  fetchMock.callHistory
    .calls("path:/api/bookmark/ordering", { method: "PUT" })
    .map(({ options }): unknown => JSON.parse(String(options.body)));

describe("nav > containers > MainNavbar > bookmarks", () => {
  it("removes a bookmark from its sidebar item", async () => {
    const bookmark = createMockBookmark({
      id: "collection-1",
      type: "collection",
      item_id: 1,
      name: "Bookmarked collection",
    });
    await setup({ bookmarks: [bookmark] });

    await userEvent.click(
      within(getBookmarksSection()).getByRole("button", {
        name: "Remove bookmark",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("section", { name: "Bookmarks" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      fetchMock.callHistory.calls("path:/api/bookmark/collection/1", {
        method: "DELETE",
      }),
    ).toHaveLength(1);
  });

  it("hides and shows the bookmark list", async () => {
    setupUpdateSettingEndpoint();
    await setup({ bookmarks: [createCardBookmark(1, "Orders")] });

    const header = within(getBookmarksSection()).getByRole("button", {
      name: /Bookmarks/,
    });

    await userEvent.click(header);
    expect(
      within(getBookmarksSection()).queryByRole("link", { name: /Orders/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(header);
    expect(
      within(getBookmarksSection()).getByRole("link", { name: /Orders/ }),
    ).toBeInTheDocument();

    // The expanded state is saved as a debounced user setting
    await waitFor(() =>
      expect(
        fetchMock.callHistory
          .calls("path:/api/setting/expand-bookmarks-in-nav")
          .map(({ options }): unknown => JSON.parse(String(options.body))),
      ).toContainEqual({ value: true }),
    );
  });

  it("reorders bookmarks with drag and drop", async () => {
    const question1 = createCardBookmark(1, "Question 1");
    const question2 = createCardBookmark(2, "Question 2");
    const question3 = createCardBookmark(3, "Question 3");
    await setup({ bookmarks: [question3, question2, question1] });

    expect(getBookmarkNames()).toEqual([
      "Question 3",
      "Question 2",
      "Question 1",
    ]);

    await dropBookmarkOver(question1, question3);

    await waitFor(() =>
      expect(getBookmarkNames()).toEqual([
        "Question 1",
        "Question 3",
        "Question 2",
      ]),
    );
    expect(getReorderRequests()).toEqual([
      {
        orderings: [
          { type: "card", item_id: 1 },
          { type: "card", item_id: 3 },
          { type: "card", item_id: 2 },
        ],
      },
    ]);

    await dropBookmarkOver(question3, question2);

    await waitFor(() =>
      expect(getBookmarkNames()).toEqual([
        "Question 1",
        "Question 2",
        "Question 3",
      ]),
    );
    expect(getReorderRequests()).toHaveLength(2);
  });

  it("restores the bookmark order when saving it fails", async () => {
    const orders = createCardBookmark(1, "Orders");
    const ordersCount = createCardBookmark(2, "Orders, Count");
    await setup({ bookmarks: [ordersCount, orders] });
    const response = defer<number>();
    fetchMock.modifyRoute("bookmark-ordering", {
      response: () => response.promise,
    });

    await dropBookmarkOver(ordersCount, orders);

    await waitFor(() =>
      expect(getBookmarkNames()).toEqual(["Orders", "Orders, Count"]),
    );

    await act(async () => response.resolve(500));

    await waitFor(() =>
      expect(getBookmarkNames()).toEqual(["Orders, Count", "Orders"]),
    );
  });
});
