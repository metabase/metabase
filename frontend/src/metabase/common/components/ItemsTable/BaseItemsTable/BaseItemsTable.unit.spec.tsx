import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { DEFAULT_VISIBLE_COLUMNS_LIST } from "metabase/common/collections/columns";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import type { ItemWithLastEditInfo } from "metabase/common/components/LastEditInfoLabel/LastEditInfoLabel";
import { dayjs } from "metabase/dayjs";
import { Route } from "metabase/router";
import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/utils/formatting";
import type { CollectionItem, IconName } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { BaseItemsTableProps } from "./BaseItemsTable";
import { BaseItemsTable } from "./BaseItemsTable";

const timestamp = "2021-06-03T19:46:52.128";

function getCollectionItem({
  id = 1,
  model = "dashboard",
  name = "My Item",
  description = "A description",
  ...rest
}: Partial<CollectionItem> & {
  icon?: IconName;
  url?: string;
} = {}): CollectionItem & ItemWithLastEditInfo {
  return {
    "last-edit-info": {
      id: 1,
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      timestamp,
    },
    collection_id: null,
    ...rest,
    id,
    model,
    description,
    name,
    collection: createMockCollection({ can_write: true }),
    archived: false,
  };
}

const VISIBLE_COLUMNS_MAP = getVisibleColumnsMap(DEFAULT_VISIBLE_COLUMNS_LIST);

describe("BaseItemsTable", () => {
  const ITEM = getCollectionItem();

  function setup({
    items = [ITEM],
    ...props
  }: { items?: CollectionItem[] } & Partial<BaseItemsTableProps> = {}) {
    return renderWithProviders(
      <Route
        path="/"
        element={
          <BaseItemsTable
            items={items}
            sortingOptions={{
              sort_column: "name",
              sort_direction: "asc",
            }}
            onSortingOptionsChange={jest.fn()}
            visibleColumnsMap={VISIBLE_COLUMNS_MAP}
            {...props}
          />
        }
      />,
      { withDND: true, withRouter: true },
    );
  }

  it("displays item data", () => {
    setup();
    const lastEditedAt = dayjs(timestamp).format("MMMM D, YYYY");

    expect(screen.getByText(ITEM.name)).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(lastEditedAt)).toBeInTheDocument();
  });

  it("displays last edit time on hover", async () => {
    setup();
    const lastEditedAt = dayjs(timestamp).format("MMMM D, YYYY");

    await userEvent.hover(screen.getByText(lastEditedAt));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      dayjs(timestamp).format(`${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`),
    );
  });

  it("allows user with write permission to select all items", async () => {
    const onSelectAll = jest.fn();
    setup({
      hasUnselected: true,
      onSelectAll,
      collection: createMockCollection({ can_write: true }),
      onToggleSelected: jest.fn(),
    });

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(onSelectAll).toHaveBeenCalled();
  });

  it("allows user with write permission to deselect all items", async () => {
    const onSelectNone = jest.fn();
    setup({
      hasUnselected: false,
      onSelectNone,
      collection: createMockCollection({ can_write: true }),
      onToggleSelected: jest.fn(),
    });

    await userEvent.click(screen.getByLabelText("Select all items"));

    expect(onSelectNone).toHaveBeenCalled();
  });

  it("does not display select all checkbox to user without write permissions", () => {
    setup({
      hasUnselected: true,
      onSelectAll: jest.fn(),
    });

    expect(screen.queryByLabelText("Select all items")).not.toBeInTheDocument();
  });

  describe("library collections", () => {
    beforeEach(() => {
      mockSettings({
        "token-features": createMockTokenFeatures({ library: true }),
      });
      setupEnterpriseOnlyPlugin("library");
    });

    it("does not display select all checkbox for library collections", () => {
      setup({
        hasUnselected: true,
        onSelectAll: jest.fn(),
        onToggleSelected: jest.fn(),
        collection: createMockCollection({
          can_write: true,
          type: "library",
        }),
      });

      expect(
        screen.queryByLabelText("Select all items"),
      ).not.toBeInTheDocument();
    });
  });

  describe("description", () => {
    it("shows description on hover", async () => {
      const DESCRIPTION = "My collection";
      const ITEM = getCollectionItem({ description: DESCRIPTION });

      setup({ items: [ITEM] });

      const icon = getIcon("info");
      await userEvent.hover(icon);

      const tooltip = await screen.findByRole("tooltip");

      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent(DESCRIPTION);
    });

    it("renders a markdown link in the description tooltip and hides it on unhover", async () => {
      const plainItem = getCollectionItem({
        id: 1,
        name: "Plain item",
        description: null,
      });
      const linkedItem = getCollectionItem({
        id: 2,
        name: "Linked item",
        description: "[link](https://metabase.com)",
      });
      setup({ items: [plainItem, linkedItem] });

      const row = screen.getByRole("row", { name: /Linked item/ });
      const icon = within(row).getByLabelText("info icon");
      await userEvent.hover(icon);

      const tooltip = await screen.findByRole("tooltip");
      expect(
        within(tooltip).getByRole("link", { name: "link" }),
      ).toHaveAttribute("href", "https://metabase.com");
      expect(tooltip).not.toHaveTextContent("[link]");

      await userEvent.unhover(icon);
      await waitFor(() => {
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });
    });

    it("shows markdown in description on hover", async () => {
      const DESCRIPTION = "**important** text";
      const ITEM = getCollectionItem({ description: DESCRIPTION });

      setup({ items: [ITEM] });

      const icon = getIcon("info");
      await userEvent.hover(icon);

      const tooltip = await screen.findByRole("tooltip");

      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent("important text");
    });

    it("shows a multi-line markdown model description with headings on hover (metabase#34574)", async () => {
      const otherItem = getCollectionItem({
        id: 1,
        name: "Other model",
        description: "Other description",
      });
      const markdownItem = getCollectionItem({
        id: 2,
        name: "34574",
        model: "dataset",
        description: "# Hello\n## World\nThis is an **important** description!",
      });
      setup({ items: [otherItem, markdownItem] });

      const row = screen.getByRole("row", { name: /34574/ });
      await userEvent.hover(within(row).getByLabelText("info icon"));

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent("Hello");
      expect(tooltip).toHaveTextContent("World");
      expect(tooltip).toHaveTextContent("This is an important description!");
      expect(tooltip).not.toHaveTextContent("#");
      expect(tooltip).not.toHaveTextContent("Other description");
    });
  });

  describe("last edited by", () => {
    // jsdom has no layout: every cell is as wide as a narrow column, and its
    // text is as wide as its length.
    const COLUMN_WIDTH = 200;
    const CHARACTER_WIDTH = 8;
    const LONG_EMAIL = "averyverylongemail@veryverylongdomain.com";
    const SHORT_EMAIL = "me@email.com";
    let elementRectSpy: jest.SpyInstance;
    let rangeRectSpy: jest.SpyInstance;

    beforeEach(() => {
      elementRectSpy = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, COLUMN_WIDTH, 16));
      rangeRectSpy = jest
        .spyOn(Range.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Range) {
          const textLength = this.startContainer.textContent?.length ?? 0;
          return new DOMRect(0, 0, textLength * CHARACTER_WIDTH, 16);
        });
    });

    afterEach(() => {
      elementRectSpy.mockRestore();
      rangeRectSpy.mockRestore();
    });

    function getItemEditedBy(id: number, email: string) {
      return getCollectionItem({
        id,
        name: `Item ${id}`,
        "last-edit-info": {
          id: 1,
          first_name: null,
          last_name: null,
          email,
          timestamp,
        },
      });
    }

    it("shows the editor's email when the editor has no name, with a tooltip only for a truncated email", async () => {
      setup({
        items: [
          getItemEditedBy(1, LONG_EMAIL),
          getItemEditedBy(2, SHORT_EMAIL),
        ],
      });

      const longEmail = screen.getByText(LONG_EMAIL);
      await userEvent.hover(longEmail);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG_EMAIL);

      await userEvent.unhover(longEmail);
      await waitFor(() => {
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });

      await userEvent.hover(screen.getByText(SHORT_EMAIL));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
