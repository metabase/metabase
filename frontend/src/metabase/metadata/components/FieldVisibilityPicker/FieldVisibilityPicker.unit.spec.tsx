import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { FieldVisibilityType } from "metabase-types/api";

import { FieldVisibilityPicker } from "./FieldVisibilityPicker";

interface SetupOpts {
  value?: FieldVisibilityType;
  onChange?: (value: FieldVisibilityType) => void;
}

const setup = ({ value = "normal", onChange = jest.fn() }: SetupOpts = {}) => {
  renderWithProviders(
    <FieldVisibilityPicker value={value} onChange={onChange} />,
  );

  return { onChange };
};

describe("FieldVisibilityPicker", () => {
  it("renders with the correct initial value", () => {
    setup({ value: "sensitive" });

    const select = screen.getByPlaceholderText("Select a field visibility");

    expect(select).toHaveValue("Do not include");
  });

  it("displays all available options when clicked", async () => {
    setup();

    const select = screen.getByPlaceholderText("Select a field visibility");

    await userEvent.click(select);

    expect(screen.getByText("Everywhere")).toBeInTheDocument();
    expect(screen.getByText("Only in detail views")).toBeInTheDocument();
    expect(screen.getByText("Do not include")).toBeInTheDocument();
  });

  it("calls onChange with the selected value when an option is chosen", async () => {
    const { onChange } = setup();

    const select = screen.getByPlaceholderText("Select a field visibility");

    await userEvent.click(select);
    await userEvent.click(screen.getByText("Do not include"));

    expect(onChange).toHaveBeenCalledWith("sensitive");
  });

  it("shows correct visibility descriptions (metabase#56077)", async () => {
    setup();

    const picker = screen.getByPlaceholderText("Select a field visibility");
    await userEvent.click(picker);

    const dropdown = within(screen.getByRole("listbox"));

    expect(
      dropdown.getByText(
        "The default setting. This field will be displayed normally in tables and charts.",
      ),
    ).toBeInTheDocument();
    expect(
      dropdown.getByText(
        "This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart.",
      ),
    ).toBeInTheDocument();
    expect(
      dropdown.getByText(
        "This field won't be visible or selectable in questions created with the GUI interfaces. It will still be accessible in SQL/native queries.",
      ),
    ).toBeInTheDocument();
  });
});
