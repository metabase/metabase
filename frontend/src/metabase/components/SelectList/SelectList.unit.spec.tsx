import { screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { getIcon } from "__support__/ui";

import SelectList from "./index";

describe("Components > SelectList", () => {
  it("renders a list of items", () => {
    render(
      <SelectList color="brand">
        <SelectList.Item id="1" name="Item 1" icon="check" onSelect={_.noop} />
        <SelectList.Item id="2" name="Item 2" icon="check" onSelect={_.noop} />
      </SelectList>,
    );

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("shows the currently selected item", () => {
    render(
      <SelectList>
        <SelectList.Item id="1" name="Item 1" icon="check" onSelect={_.noop} />
        <SelectList.Item
          id="2"
          name="Item 2"
          icon="check"
          isSelected
          onSelect={_.noop}
        />
      </SelectList>,
    );

    expect(screen.getByLabelText("Item 2")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("allows the user to select an item on click", async () => {
    const selectSpy = jest.fn();

    render(
      <SelectList color="brand">
        <SelectList.Item id="1" name="Item 1" icon="check" onSelect={_.noop} />
        <SelectList.Item
          id="2"
          name="Item 2"
          icon="check"
          onSelect={selectSpy}
        />
      </SelectList>,
    );

    await userEvent.click(screen.getByText("Item 2"));

    expect(selectSpy).toHaveBeenCalledWith("2", expect.anything());
  });

  describe("SelectList.Item", () => {
    it("renders the name of the item", () => {
      render(
        <SelectList.Item id="1" name="Item 1" icon="check" onSelect={_.noop} />,
      );

      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    it("renders the icon of the item", () => {
      render(
        <SelectList.Item id="1" name="Item 1" icon="check" onSelect={_.noop} />,
      );

      expect(getIcon("check")).toBeInTheDocument();
    });

    it("renders the right icon of the item", () => {
      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={_.noop}
          rightIcon="warning"
        />,
      );

      expect(getIcon("warning")).toBeInTheDocument();
    });

    it("renders the item as selected", () => {
      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={_.noop}
          rightIcon="warning"
          isSelected
        />,
      );

      expect(screen.getByLabelText("Item 1")).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
});
