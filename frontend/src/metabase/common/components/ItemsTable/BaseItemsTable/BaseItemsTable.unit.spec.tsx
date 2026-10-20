import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen, within } from "__support__/ui";
import {
  COLLECTION_CONTENT_COLUMNS,
  type CollectionContentTableColumn,
  DEFAULT_VISIBLE_COLUMNS_LIST,
} from "metabase/common/collections/columns";
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

  it("renders the header in the order of COLLECTION_CONTENT_COLUMNS, which the skeleton rows follow", () => {
    const HEADER_LABELS: Record<CollectionContentTableColumn, string> = {
      type: "Type",
      name: "Name",
      description: "Description",
      lastEditedBy: "Last edited by",
      lastEditedAt: "Last edited at",
      actionMenu: "",
      archive: "",
    };
    setup({
      items: [],
      visibleColumnsMap: getVisibleColumnsMap([...COLLECTION_CONTENT_COLUMNS]),
    });

    const headerCells = within(
      screen.getByTestId("items-table-head"),
    ).getAllByRole("columnheader");
    // The last header cell is the table's right edge, not a column.
    const columnLabels = headerCells
      .slice(0, -1)
      .map((cell) => cell.textContent);

    expect(columnLabels).toEqual(
      COLLECTION_CONTENT_COLUMNS.map((column) => HEADER_LABELS[column]),
    );
  });

  describe("skeleton", () => {
    const selectableProps: Partial<BaseItemsTableProps> = {
      collection: createMockCollection({ can_write: true }),
      onToggleSelected: jest.fn<void, [CollectionItem]>(),
    };

    it.each([
      { description: "when items can be selected", props: selectableProps },
      { description: "when items can't be selected", props: {} },
    ])(
      "renders one placeholder cell per header cell $description",
      ({ props }) => {
        setup({ withSkeleton: true, items: [], ...props });

        const headerCells = within(
          screen.getByTestId("items-table-head"),
        ).getAllByRole("columnheader");
        // The placeholder rows are hidden from assistive technology.
        const rows = within(
          screen.getByTestId("items-table-skeleton"),
        ).getAllByRole("row", { hidden: true });

        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((row) => {
          expect(
            within(row).getAllByRole("cell", { hidden: true }),
          ).toHaveLength(headerCells.length);
        });
      },
    );

    it("does not render the select all checkbox", () => {
      setup({ withSkeleton: true, items: [], ...selectableProps });

      expect(screen.getByTestId("items-table-skeleton")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Select all items"),
      ).not.toBeInTheDocument();
    });
  });
});
