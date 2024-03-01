import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  mockGetBoundingClientRect,
  mockScrollBy,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Button } from "metabase/ui";
import {
  createMockSearchResult,
  createMockSearchResults,
} from "metabase-types/api/mocks";

import type { CollectionPickerItem, EntityTab } from "../../types";

import type { EntityPickerModalOptions } from "./EntityPickerModal";
import { EntityPickerModal } from "./EntityPickerModal";

interface setupProps {
  title?: string;
  onItemSelect?: () => void;
  onClose?: () => void;
  onConfirm?: () => void;
  tabs?: [EntityTab, ...EntityTab[]];
  options?: EntityPickerModalOptions;
  selectedItem?: null | CollectionPickerItem;
  actionButtons?: JSX.Element[];
}

const TestPicker = ({ name }: { name: string }) => (
  <p>{`Test picker ${name}`}</p>
);

const TEST_TAB: EntityTab = {
  icon: "audit",
  displayName: "All the foo",
  model: "test1",
  element: <TestPicker name="foo" />,
};

const setup = ({
  title = "Pick a thing",
  onItemSelect = jest.fn(),
  onClose = jest.fn(),
  onConfirm = jest.fn(),
  tabs = [TEST_TAB],
  selectedItem = null,
  ...rest
}: setupProps = {}) => {
  mockGetBoundingClientRect();
  mockScrollBy();

  renderWithProviders(
    <EntityPickerModal
      title={title}
      onItemSelect={onItemSelect}
      canSelectItem={true}
      onClose={onClose}
      tabs={tabs}
      selectedItem={selectedItem}
      onConfirm={onConfirm}
      {...rest}
    />,
  );
};

describe("EntityPickerModal", () => {
  afterAll(() => {
    jest.restoreAllMocks();
  });
  it("should render a picker", async () => {
    setup({});
    expect(await screen.findByText("Test picker foo")).toBeInTheDocument();
  });

  it("should render a search bar by default and show confirmation button", async () => {
    setup();
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
    });
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("should show a tab list when more than 1 tab is supplied", async () => {
    const tabs: [EntityTab, ...EntityTab[]] = [
      TEST_TAB,
      {
        icon: "folder",
        displayName: "All the bar",
        model: "test2",
        element: <TestPicker name="bar" />,
      },
    ];
    setup({
      tabs,
    });

    const tabList = await screen.findByRole("tablist");

    expect(tabList).toBeInTheDocument();

    expect(
      await within(tabList).findByRole("tab", { name: /All the foo/ }),
    ).toBeInTheDocument();
    expect(
      await within(tabList).findByRole("tab", { name: /All the bar/ }),
    ).toBeInTheDocument();

    userEvent.click(
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

    fetchMock.get("path:/api/user/recipients", []);

    const onItemSelect = jest.fn();
    const onConfirm = jest.fn();
    setup({
      onItemSelect,
      onConfirm,
    });

    userEvent.type(await screen.findByPlaceholderText("Search…"), "My ", {
      delay: 50,
    });

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /2 results for "My"/ }),
    ).toBeInTheDocument();

    expect(await screen.findAllByTestId("search-result-item")).toHaveLength(2);

    userEvent.click(await screen.findByText("Search Result 1"));

    expect(onItemSelect).toHaveBeenCalledTimes(1);
  });

  it("should accept an array of action buttons", async () => {
    const actionFn = jest.fn();

    const actionButtons = [
      <Button onClick={actionFn} key="1">
        Click Me
      </Button>,
    ];

    setup({ actionButtons });

    expect(
      await screen.findByRole("button", { name: "Click Me" }),
    ).toBeInTheDocument();
    userEvent.click(await screen.findByRole("button", { name: "Click Me" }));

    expect(actionFn).toHaveBeenCalledTimes(1);
  });
});
