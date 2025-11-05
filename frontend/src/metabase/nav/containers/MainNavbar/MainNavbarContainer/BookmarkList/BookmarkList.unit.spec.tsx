import type { ComponentProps } from "react";
import { times } from "underscore";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockBookmark } from "metabase-types/api/mocks";

import BookmarkList from "./BookmarkList";

const mockProps: ComponentProps<typeof BookmarkList> = {
  bookmarks: [],
  onSelect: jest.fn(),
  reorderBookmarks: jest.fn(),
  onToggle: jest.fn(),
  initialState: "expanded",
};

const createBookmarks = (howMany: number) => {
  return times(howMany, (i) => {
    const n = i + 1;
    return createMockBookmark({
      id: `bookmark-${n}`,
      name: `Bookmark ${n}`,
      item_id: n,
    });
  });
};

describe("BookmarkList", () => {
  it("shows drag handles when there are multiple bookmarks", () => {
    const bookmarks = createBookmarks(3);

    renderWithProviders(<BookmarkList {...mockProps} bookmarks={bookmarks} />);

    bookmarks.forEach((bookmark) => {
      expect(screen.getByText(bookmark.name)).toBeInTheDocument();
    });

    const grabberIcons = screen.getAllByLabelText("grabber icon");
    expect(grabberIcons).toHaveLength(bookmarks.length);
  });

  it("hides drag handles when there is only one bookmark", () => {
    const bookmarks = createBookmarks(1);

    renderWithProviders(<BookmarkList {...mockProps} bookmarks={bookmarks} />);

    bookmarks.forEach((bookmark) => {
      expect(screen.getByText(bookmark.name)).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("grabber icon")).not.toBeInTheDocument();
  });
});
