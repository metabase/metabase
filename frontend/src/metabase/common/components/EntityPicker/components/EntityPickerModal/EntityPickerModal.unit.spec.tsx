import { renderWithProviders, screen } from "__support__/ui";

import {
  EntityPickerModal,
  EntityPickerModalOptions,
} from "./EntityPickerModal";
import fetchMock from "fetch-mock";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSearchResult,
  createMockSearchResults,
  createMockUser,
} from "metabase-types/api/mocks";
import userEvent from "@testing-library/user-event";
import type { ValidTab } from "../../utils";

interface setupProps {
  title?: string;
  onChange?: () => void;
  onClose?: () => void;
  tabs?: ValidTab[];
  options?: EntityPickerModalOptions;
}

const setup = ({
  title = "Pick a thing",
  onChange = jest.fn(),
  onClose = jest.fn(),
  tabs = ["collection"],
  ...rest
}: setupProps = {}) => {
  fetchMock.get("path:/api/user/current", createMockUser());
  fetchMock.get(
    "path:/api/collection/1",
    createMockCollection({ name: "My Personal Collection" }),
  );
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root", name: "Our Analytics" }),
  );

  fetchMock.get("path:/api/collection/root/items", {
    data: [
      createMockCollectionItem({
        id: 2,
        name: "Collection 1",
        model: "collection",
      }),
      createMockCollectionItem({
        id: 3,
        name: "Collection 2",
        model: "collection",
      }),
      createMockCollectionItem({
        id: 4,
        name: "Collection 3",
        model: "collection",
      }),
    ],
  });

  renderWithProviders(
    <EntityPickerModal
      title={title}
      onChange={onChange}
      onClose={onClose}
      tabs={tabs}
      {...rest}
    />,
  );
};

describe("EntityPickerModal", () => {
  it("should render a picker", async () => {
    setup({});
    expect(
      await screen.findByText("My Personal Collection"),
    ).toBeInTheDocument();

    expect(await screen.findByText("Collection 1")).toBeInTheDocument();
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

  //We call onChange too much at the moment
  it.skip("When disabling confirm buttons, clicking an item should trigger onChange", async () => {
    const onChange = jest.fn();
    setup({
      onChange,
      options: {
        hasConfirmButtons: false,
      },
    });
    await expect(
      screen.queryByRole("button", { name: "Select" }),
    ).not.toBeInTheDocument();

    userEvent.click(await screen.findByText("Collection 1"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("should show a tab list when more than 1 tab is supplied", async () => {
    setup({
      tabs: ["collection", "question"],
    });

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
  });

  it("should show a search tab list when a we type in the search input", async () => {
    fetchMock.get(
      "path:/api/search",
      createMockSearchResults({
        items: [
          createMockSearchResult({
            name: "Search Result 1",
            model: "collection",
            id: 100,
          }),
          createMockSearchResult({
            name: "Search Result 2",
            model: "collection",
            id: 101,
          }),
        ],
      }),
    );

    fetchMock.get("path:/api/user/recipients", []);

    setup({});

    userEvent.type(await screen.findByPlaceholderText("Search…"), "My ", {
      delay: 50,
    });

    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: /2 results for "My "/ }),
    ).toBeInTheDocument();

    expect(await screen.findAllByTestId("search-result-item")).toHaveLength(2);
  });
});
