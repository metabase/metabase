import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRecentViewsEndpoints } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Button } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
  createMockSearchResults,
} from "metabase-types/api/mocks";

import type { EntityTab, TypeWithModel } from "../../types";

import type { EntityPickerModalOptions } from "./EntityPickerModal";
import { EntityPickerModal } from "./EntityPickerModal";

type SampleModelType = "card" | "table";

interface SetupOpts {
  title?: string;
  onItemSelect?: () => void;
  onClose?: () => void;
  onConfirm?: () => void;
  tabs?: EntityTab<SampleModelType>[];
  options?: EntityPickerModalOptions;
  selectedItem?: null | TypeWithModel<number, SampleModelType>;
  actionButtons?: JSX.Element[];
  recentFilter?: (item: RecentItem[]) => RecentItem[];
  recentItems?: RecentItem[];
  defaultToRecentTab?: boolean;
  initialValue?: { model: SampleModelType };
}

const TestPicker = ({ name }: { name: string }) => (
  <p>{`Test picker ${name}`}</p>
);

const TEST_CARD_TAB: EntityTab<SampleModelType> = {
  icon: "audit",
  displayName: "All the foo",
  model: "card",
  element: <TestPicker name="foo" />,
};

const TEST_TABLE_TAB: EntityTab<SampleModelType> = {
  icon: "audit",
  displayName: "All the bar",
  model: "table",
  element: <TestPicker name="bar" />,
};

const setup = ({
  title = "Pick a thing",
  onItemSelect = jest.fn(),
  onClose = jest.fn(),
  onConfirm,
  tabs = [TEST_CARD_TAB],
  selectedItem = null,
  recentItems = [],
  recentFilter,
  ...rest
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  mockScrollBy();
  setupRecentViewsEndpoints(recentItems);

  renderWithProviders(
    <EntityPickerModal
      title={title}
      onItemSelect={onItemSelect}
      canSelectItem={true}
      onClose={onClose}
      onConfirm={onConfirm}
      tabs={tabs}
      selectedItem={selectedItem}
      recentFilter={recentFilter}
      {...rest}
    />,
  );
};

describe("EntityPickerModal", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should throw when options.hasConfirmButtons is true but onConfirm prop is missing", async () => {
    expect(() => {
      setup({
        options: {
          hasConfirmButtons: true,
        },
        onConfirm: undefined,
      });
    }).toThrow("onConfirm prop is required when hasConfirmButtons is true");
  });

  it("should render a picker", async () => {
    setup({
      onConfirm: jest.fn(),
    });

    expect(await screen.findByText("Test picker foo")).toBeInTheDocument();
  });

  it("should render a search bar by default and show confirmation button", async () => {
    setup({
      onConfirm: jest.fn(),
    });

    expect(await screen.findByPlaceholderText("Search…")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Select" }),
    ).toBeInTheDocument();
  });

  it("should be able to disable the search bar", () => {
    setup({
      options: {
        showSearch: false,
      },
      onConfirm: jest.fn(),
    });

    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("should show a tab list when more than 1 tab is supplied", async () => {
    setup({
      tabs: [
        TEST_CARD_TAB,
        {
          icon: "folder",
          displayName: "All the bar",
          model: "table",
          element: <TestPicker name="bar" />,
        },
      ],
      onConfirm: jest.fn(),
    });

    const tabList = await screen.findByRole("tablist");

    expect(tabList).toBeInTheDocument();

    expect(
      await within(tabList).findByRole("tab", { name: /All the foo/ }),
    ).toBeInTheDocument();
    expect(
      await within(tabList).findByRole("tab", { name: /All the bar/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      await within(tabList).findByRole("tab", { name: /All the bar/ }),
    );

    expect(await screen.findByText("Test picker bar")).toBeInTheDocument();
  });

  it("should show a search tab list when we type in the search input", async () => {
    fetchMock.get(
      "path:/api/search",
      createMockSearchResults({
        items: [
          createMockSearchResult({
            name: "Search Result 1",
            model: "collection",
            can_write: true,
            id: 100,
          }),
          createMockSearchResult({
            name: "Search Result 2",
            model: "collection",
            can_write: true,
            id: 101,
          }),
        ],
      }),
    );

    fetchMock.get("path:/api/user/recipients", { data: [] });

    const onItemSelect = jest.fn();

    setup({
      onItemSelect,
      onConfirm: jest.fn(),
    });

    await userEvent.type(await screen.findByPlaceholderText("Search…"), "My ", {
      delay: 50,
    });

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /2 results for "My"/ }),
    ).toBeInTheDocument();

    expect(await screen.findAllByTestId("result-item")).toHaveLength(2);

    await userEvent.click(await screen.findByText("Search Result 1"));

    expect(onItemSelect).toHaveBeenCalledTimes(1);
  });

  it("should accept an array of action buttons", async () => {
    const actionFn = jest.fn();

    const actionButtons = [
      <Button onClick={actionFn} key="1">
        Click Me
      </Button>,
    ];

    setup({
      actionButtons,
      onConfirm: jest.fn(),
    });

    expect(
      await screen.findByRole("button", { name: "Click Me" }),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Click Me" }),
    );

    expect(actionFn).toHaveBeenCalledTimes(1);
  });

  describe("Recents Tab", () => {
    const recentItems = [
      createMockRecentCollectionItem({
        id: 100,
        model: "card",
        name: "Recent Question",
        description: "A card",
        timestamp: "2021-09-01T00:00:00",
      }),
      createMockRecentCollectionItem({
        id: 200,
        model: "card",
        name: "Recent Question 2",
        description: "sometimes invisible",
        timestamp: "2021-09-01T00:00:00",
      }),
      createMockRecentCollectionItem({
        id: 101,
        model: "dashboard",
        name: "Recent dashboard",
        description: "A board",
        timestamp: "2021-09-01T00:00:00",
      }),
      createMockRecentTableItem({
        id: 102,
        model: "table",
        name: "Recent_Table",
        display_name: "Recent Table",
        description: "A tableau",
        timestamp: "2021-09-01T00:00:00",
      }),
    ];

    it("should not show a recents tab when there are no recent items", async () => {
      setup({ onConfirm: jest.fn() });

      await screen.findByText("Test picker foo");

      expect(screen.queryByText("Recents")).not.toBeInTheDocument();
    });

    it("should show a recents tab when there are recent items", async () => {
      setup({
        recentItems,
        onConfirm: jest.fn(),
      });

      expect(
        await screen.findByRole("tab", { name: /Recents/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Recent Question")).toBeInTheDocument();
    });

    it("should not default to the recent tab if defaultToRecents is false", async () => {
      setup({
        recentItems,
        defaultToRecentTab: false,
        initialValue: { model: "card" },
        onConfirm: jest.fn(),
      });

      expect(
        await screen.findByRole("tab", { name: /Recents/ }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Test picker foo")).toBeInTheDocument();
    });

    it("should group recents by time", async () => {
      setup({
        recentItems,
        onConfirm: jest.fn(),
      });

      expect(await screen.findByText("Earlier")).toBeInTheDocument();
    });

    it("should filter out irrelevant models", async () => {
      setup({
        onConfirm: jest.fn(),
        recentItems,
        tabs: [TEST_CARD_TAB, TEST_TABLE_TAB],
      });

      expect(await screen.findByText("Recent Question")).toBeInTheDocument();
      expect(await screen.findByText("Recent Table")).toBeInTheDocument();
      expect(screen.queryByText("Recent Dashboard")).not.toBeInTheDocument();
    });

    it("should accept an arbitrary filter", async () => {
      setup({
        onConfirm: jest.fn(),
        recentItems,
        recentFilter: items =>
          items.filter(item => !item.description?.includes("invisible")),
      });

      expect(await screen.findByText("Recent Question")).toBeInTheDocument();
      expect(screen.queryByText("Recent Question 2")).not.toBeInTheDocument();
    });
  });
});
