import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { Route } from "react-router";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { DEFAULT_VISIBLE_COLUMNS_LIST } from "metabase/collections/components/CollectionContent";
import { getVisibleColumnsMap } from "metabase/common/components/ItemsTable/utils";
import type { ItemWithLastEditInfo } from "metabase/common/components/LastEditInfoLabel/LastEditInfoLabel";
import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";
import type { IconName } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

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
        component={() => (
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
        )}
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
  });
});
