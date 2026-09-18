import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { getIcon, render, screen } from "__support__/ui";

import { SelectList } from "./index";

describe("Components > SelectList", () => {
  it("renders a list of items", () => {
    render(
      <SelectList color="core-brand">
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
      <SelectList color="core-brand">
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

    it("does not call onSelect on click when isDisabled", async () => {
      const selectSpy = jest.fn();

      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={selectSpy}
          isDisabled
        />,
      );

      await userEvent.click(screen.getByText("Item 1"));

      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("does not call onSelect on Enter when isDisabled", async () => {
      const selectSpy = jest.fn();

      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={selectSpy}
          isDisabled
        />,
      );

      screen.getByLabelText("Item 1").focus();
      await userEvent.keyboard("{Enter}");

      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("marks a disabled item with aria-disabled", () => {
      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={_.noop}
          isDisabled
        />,
      );

      expect(screen.getByLabelText("Item 1")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("does not mark a default item as disabled", async () => {
      const selectSpy = jest.fn();

      render(
        <SelectList.Item
          id="1"
          name="Item 1"
          icon="check"
          onSelect={selectSpy}
        />,
      );

      const item = screen.getByLabelText("Item 1");
      expect(item).not.toHaveAttribute("aria-disabled");

      await userEvent.click(item);

      expect(selectSpy).toHaveBeenCalledWith("1", expect.anything());
    });
  });
});
