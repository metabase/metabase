import userEvent from "@testing-library/user-event";
import { screen, render } from "__support__/ui";
import { NestedItemPicker } from ".";

const initialState = new Array(3).fill(0).map((_, index, arr) => ({
  items: new Array(10).fill(0).map((__, i) => ({
    id: `${index}-${i}`,
    name: `level-${index}-item-${i}`,
    model: i < 5 ? "collection" : "dashboard",
  })),
  selectedItem:
    index === arr.length - 1
      ? {}
      : {
          id: `${index}-2`,
          model: "collection",
        },
}));

const setup = ({
  onFolderSelect = jest.fn(),
  onItemSelect = jest.fn(),
} = {}) => {
  render(
    <NestedItemPicker
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      folderModel="collection"
      initialState={initialState}
    />,
  );
};

describe("nesteditempicker", () => {
  it("should render an initial state", () => {
    setup();

    expect(
      screen.getByRole("button", { name: /level-0-item-2/ }),
    ).toHaveAttribute("data-active", "true");
    expect(
      screen.getByRole("button", { name: /level-1-item-2/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should call back and update when a folder is clicked", async () => {
    const onFolderSelect = jest.fn(async () => {
      return [
        {
          id: 50,
          name: `collection 50`,
          model: "collection",
        },
        {
          id: 51,
          name: `dashboard 51`,
          model: "dashboard",
        },
      ];
    });

    setup({ onFolderSelect });

    userEvent.click(
      await screen.findByRole("button", { name: /level-2-item-1/ }),
    );

    expect(
      await screen.findByRole("button", { name: /level-2-item-1/ }),
    ).toHaveAttribute("data-active", "true");
    expect(onFolderSelect).toHaveBeenCalledTimes(1);

    expect(
      await screen.findByRole("button", { name: /collection 50/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /dashboard 51/ }),
    ).toBeInTheDocument();
  });

  it("should prune the tree when clicking an item that is not on the latest branch", async () => {
    const onFolderSelect = jest.fn(async () => {
      return [];
    });

    setup({ onFolderSelect });

    expect(
      await screen.findByRole("button", { name: /level-1-item-1/ }),
    ).toBeInTheDocument();

    userEvent.click(
      await screen.findByRole("button", { name: /level-0-item-1/ }),
    );
    expect(
      await screen.findByRole("button", { name: /level-0-item-1/ }),
    ).toHaveAttribute("data-active", "true");
    expect(onFolderSelect).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("No items")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /level-1-item-1/ }),
    ).not.toBeInTheDocument();
  });

  it("should call onItemSelect when clicking an item", async () => {
    const onItemSelect = jest.fn();

    setup({ onItemSelect });

    userEvent.click(
      await screen.findByRole("button", { name: /level-0-item-7/ }),
    );

    expect(
      await screen.findByRole("button", { name: /level-0-item-7/ }),
    ).toHaveAttribute("data-active", "true");

    expect(onItemSelect).toHaveBeenCalledTimes(1);
  });
});
