import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";

import { CustomMappingModal } from "./CustomMappingModal";
import type { Mapping } from "./types";

const setup = ({
  isOpen = true,
  value = new Map(),
  onChange = jest.fn(),
  onClose = jest.fn(),
}: {
  isOpen?: boolean;
  value?: Mapping;
  onChange?: (value: Mapping) => void;
  onClose?: () => void;
} = {}) => {
  const { rerender } = renderWithProviders(
    <CustomMappingModal
      isOpen={isOpen}
      value={value}
      onChange={onChange}
      onClose={onClose}
    />,
  );

  return {
    props: {
      isOpen,
      value,
      onChange,
      onClose,
    },
    rerender,
  };
};

describe("CustomMappingModal", () => {
  it("renders modal when isOpen is true", () => {
    setup();

    expect(screen.getByText("Custom mapping")).toBeInTheDocument();
  });

  it("does not render modal when isOpen is false", () => {
    setup({ isOpen: false });

    expect(screen.queryByText("Custom mapping")).not.toBeInTheDocument();
  });

  it("displays the naming tip", () => {
    setup();

    expect(
      screen.getByText(
        "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
      ),
    ).toBeInTheDocument();
  });

  it("displays original and mapped values in a table", () => {
    setup({
      value: new Map([
        [1, "One"],
        [2, "Two"],
        [3, "3"],
      ]),
    });

    const table = within(screen.getByRole("table"));
    expect(table.getByText("1")).toBeInTheDocument();
    expect(table.getByText("2")).toBeInTheDocument();
    expect(table.getByText("3")).toBeInTheDocument();
    expect(table.getByDisplayValue("One")).toBeInTheDocument();
    expect(table.getByDisplayValue("Two")).toBeInTheDocument();
    expect(table.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("allows editing mapped values", async () => {
    const onChange = jest.fn();
    setup({
      value: new Map([
        [1, "One"],
        [2, "Two"],
        [3, "3"],
      ]),
      onChange,
    });

    const input = screen.getByDisplayValue("One");
    await userEvent.clear(input);
    await userEvent.type(input, "New One");

    expect(input).toHaveValue("New One");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        new Map([
          [1, "New One"],
          [2, "Two"],
          [3, "3"],
        ]),
      );
    });
  });

  it("disables save button when there are empty values", async () => {
    setup({
      value: new Map([
        [1, "One"],
        [2, "Two"],
        [3, "3"],
      ]),
    });

    const input = screen.getByDisplayValue("One");
    await userEvent.clear(input);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.type(input, "Value");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = jest.fn();
    setup({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = jest.fn();
    setup({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("updates mapping when value prop changes", async () => {
    const { props, rerender } = setup({ value: new Map([[1, "One"]]) });

    expect(screen.getByDisplayValue("One")).toBeInTheDocument();

    rerender(
      <CustomMappingModal {...props} value={new Map([[1, "Updated One"]])} />,
    );

    expect(screen.getByDisplayValue("Updated One")).toBeInTheDocument();
  });

  it("fills missing mappings with original values as strings", async () => {
    const onChange = jest.fn();
    setup({
      value: new Map([
        [1, undefined],
        [null, undefined],
      ]) as unknown as Mapping,
      onChange,
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        new Map([
          [1, "1"],
          [null, "null"],
        ]),
        { isAutomatic: true },
      );
    });
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
  });
});
