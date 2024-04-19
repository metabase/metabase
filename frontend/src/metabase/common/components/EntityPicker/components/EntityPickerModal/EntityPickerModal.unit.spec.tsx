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
}

const TestPicker = ({ name }: { name: string }) => (
  <p>{`Test picker ${name}`}</p>
);

const TEST_TAB: EntityTab<SampleModelType> = {
  icon: "audit",
  displayName: "All the foo",
  model: "card",
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
}: SetupOpts = {}) => {
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
    const tabs: EntityTab<SampleModelType>[] = [
      TEST_TAB,
      {
        icon: "folder",
        displayName: "All the bar",
        model: "table",
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
    const onConfirm = jest.fn();
    setup({
      onItemSelect,
      onConfirm,
    });

    await userEvent.type(await screen.findByPlaceholderText("Search…"), "My ", {
      delay: 50,
    });

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /2 results for "My"/ }),
    ).toBeInTheDocument();

    expect(await screen.findAllByTestId("search-result-item")).toHaveLength(2);

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

    setup({ actionButtons });

    expect(
      await screen.findByRole("button", { name: "Click Me" }),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Click Me" }),
    );

    expect(actionFn).toHaveBeenCalledTimes(1);
  });
});
