import type { ComponentProps } from "react";
import { times } from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockBookmark,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import BookmarkList from "./BookmarkList";

const mockProps: ComponentProps<typeof BookmarkList> = {
  bookmarks: [],
  onSelect: jest.fn(),
  reorderBookmarks: jest.fn(),
  onToggle: jest.fn(),
  initialState: "expanded",
};

const enterpriseState = createMockState({
  settings: mockSettings({
    "token-features": createMockTokenFeatures({
      remote_sync: true,
      official_collections: true,
      audit_app: true,
    }),
  }),
});
setupEnterprisePlugins();

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

  describe("collection bookmark icons (enterprise)", () => {
    it.each([
      {
        name: "Synced",
        icon: "synced_collection",
        overrides: { is_remote_synced: true },
      },
      {
        name: "Official",
        icon: "official_collection",
        overrides: { authority_level: "official" },
      },
      { name: "Regular", icon: "folder", overrides: {} },
    ])(
      "renders the $icon icon for $name collection bookmarks",
      ({ name, icon, overrides }) => {
        renderWithProviders(
          <BookmarkList
            {...mockProps}
            bookmarks={[
              createMockBookmark({ type: "collection", name, ...overrides }),
            ]}
          />,
          { storeInitialState: enterpriseState },
        );

        const row = screen.getByText(name).closest("a");
        expect(
          within(row as HTMLElement).getByLabelText(`${icon} icon`),
        ).toBeInTheDocument();
      },
    );
  });
});
